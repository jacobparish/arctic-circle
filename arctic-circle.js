const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const CANVAS_SCALE = 20
const DOMINO_BORDER_COLOR = "black"
const DOMINO_BORDER_WIDTH = 0.04
const GRID_COLOR = "black"
const GRID_BORDER_WIDTH = 0.04

const STEP_HANDLERS = [
  doCollideStep,
  doExpandStep,
  doAdvanceStep,
  doCreateStep,
]
const NUM_STEPS = STEP_HANDLERS.length

let stage
let iteration
let step
let grid
let dominoes
let dominoesToKeep

// play/pause controls
let isDoingStep = false
let isPlaying = false
let playInterval
let playSpeed = 2500
let timeout

// other controls
let orientationBiasFunction = {evaluate: () => 0.5}

// colors
let westwardColor = "#0000ff"
let eastwardColor = "#ffa500"
let northwardColor = "#ff0000"
let southwardColor = "#008000"

function init() {
  const canvas = document.getElementById("canvas")
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  stage = new createjs.Stage(canvas)

  createjs.Ticker.framerate = 60
  createjs.Ticker.addEventListener("tick", stage)

  grid = new createjs.Shape()
  grid.x = grid.y = 0

  doReset()

  document.getElementById('orientation-bias-input').addEventListener('input', event => {
    orientationBiasFunction = math.compile(event.target.value)
  })

  document.getElementById('westward-color-input').addEventListener('change', event => {
    westwardColor = event.target.value
    redraw()
  })
  document.getElementById('eastward-color-input').addEventListener('change', event => {
    eastwardColor = event.target.value
    redraw()
  })
  document.getElementById('northward-color-input').addEventListener('change', event => {
    northwardColor = event.target.value
    redraw()
  })
  document.getElementById('southward-color-input').addEventListener('change', event => {
    southwardColor = event.target.value
    redraw()
  })
}

// Reset to initial state
function doReset () {
  if (isPlaying) togglePlay()
  if (timeout) clearTimeout(timeout)

  stage.removeAllChildren()
  stage.setTransform(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_SCALE, CANVAS_SCALE)
  stage.addChild(grid)

  drawGridForIteration(1)

  // create the first 2 dominoes
  dominoes = createTwoByTwo(0, 0)
  stage.addChild(...dominoes.map(d => d.shape))

  // iteration 1 is really just the first pair of dominoes, so we start at 2
  iteration = 2
  step = 0
}

async function doStep () {
  // put a lock on this function so that spamming the button doesn't screw things up
  if (isDoingStep) return

  isDoingStep = true
  if (step >= NUM_STEPS) {
    step = 0
    iteration += 1
  }
  const stepHandler = STEP_HANDLERS[step]
  await stepHandler()
  step += 1
  isDoingStep = false
}

async function doCollideStep () {
  let positionMap = {}

  for (let d of dominoes) {
    positionMap[d.x + ',' + d.y] = d
  }

  for (let d1 of dominoes) {
    if (d1.vx === 1) {
      let d2 = positionMap[(d1.x+1) + ',' + d1.y]
      if (d2 && d2.vx === -1) {
        d1.shouldDestroy = d2.shouldDestroy = true
      }
    } else if (d1.vy === 1) {
      let d2 = positionMap[d1.x + ',' + (d1.y+1)]
      if (d2 && d2.vy === -1) {
        d1.shouldDestroy = d2.shouldDestroy = true
      }
    }
  }

  const [dominoesToDestroy, remaining] = partition(dominoes, d => d.shouldDestroy)
  dominoesToKeep = remaining

  // fade out the dominoes that will collide
  for (let domino of dominoesToDestroy) {
    createjs.Tween.get(domino.shape).to({alpha: 0}, playSpeed * .1, createjs.Ease.getPowInOut(2))
  }

  await waitFor(playSpeed * .1)

  stage.removeChild(...dominoesToDestroy.map(d => d.shape))
}

async function doExpandStep () {
  drawGridForIteration(iteration)

  // after 14 iterations, we adjust the transform so that the dominoes continue to stay within the canvas bounds
  if (iteration >= 14) {
    createjs.Tween.get(stage)
      .to({ scale: CANVAS_SCALE * 14 / iteration }, playSpeed * .1, createjs.Ease.getPowInOut(2))
  }

  await waitFor(playSpeed * .1)
}

async function doAdvanceStep () {
  // update the domino positions
  for (let domino of dominoesToKeep) {
    domino.x += domino.vx
    domino.y += domino.vy
    createjs.Tween.get(domino.shape)
      .to({ x: domino.x, y: domino.y }, playSpeed * .1, createjs.Ease.getPowInOut(2))
  }

  await waitFor(playSpeed * .1)
}

async function doCreateStep () {
  // make a 2D boolean array to hold all the occupied (false) and non-occupied (true) positions
  let map = []
  for (let i = 0; i < iteration; i++) {
    map.push(Array(iteration * 2).fill(false).fill(true, iteration - i - 1, iteration + i + 1))
  }
  for (let i = 0; i < iteration; i++) {
    map.push(Array(iteration * 2).fill(false).fill(true, i, 2 * iteration - i))
  }

  // mark the spaces that are currently occupied by dominoes
  for (let domino of dominoesToKeep) {
    for (let x = domino.x; x < domino.x + domino.w; x++) {
      for (let y = domino.y; y < domino.y + domino.h; y++) {
        map[y+iteration][x+iteration] = false
      }
    }
  }

  // search for 2x2 boxes to spawn new dominoes
  let dominoesToAdd = []
  for (let x = 0; x < 2 * iteration - 1; x++) {
    for (let y = 0; y < 2 * iteration - 1; y++) {
      if (map[y][x] && map[y+1][x] && map[y][x+1] && map[y+1][x+1]) {
        dominoesToAdd.push(...createTwoByTwo(x-iteration+1, y-iteration+1))
        // mark the spaces as occupied
        map[y][x] = map[y+1][x] = map[y][x+1] = map[y+1][x+1] = false
      }
    }
  }

  stage.addChild(...dominoesToAdd.map(d => d.shape))

  dominoes = [...dominoesToKeep, ...dominoesToAdd]
}

// Finish the current iteration
async function doIteration () {
  // an actual reason to use a do-while loop
  do {
    await doStep()
    await waitFor(playSpeed * .1)
  } while (step < NUM_STEPS)
}

// Loop while isPlaying is true
async function doPlayLoop () {
  while (isPlaying) {
    await doIteration()
    await waitFor(playSpeed * .3)
  }
}

function togglePlay () {
  isPlaying = !isPlaying
  document.getElementById('play-toggle-button').innerText = isPlaying ? 'Pause' : 'Play'
  if (isPlaying) doPlayLoop()
}

function drawGridForIteration (n) {
  grid.graphics.clear().setStrokeStyle(GRID_BORDER_WIDTH).beginStroke(GRID_COLOR)
  for (let i = -n; i <= n; i++) {
    const len = Math.min(n, Math.abs(n - Math.abs(i) + 1))
    grid.graphics.moveTo(i, -len).lineTo(i, len)
    grid.graphics.moveTo(-len, i).lineTo(len, i)
  }
}

// Create a new domino with specified position, dimensions, and direction
function createDomino (x, y, w, h, vx, vy) {
  const shape = new createjs.Shape()
  shape.graphics
    .setStrokeStyle(DOMINO_BORDER_WIDTH)
    .beginStroke(DOMINO_BORDER_COLOR)
    .beginFill(computeDominoColor(vx, vy))
    .drawRect(0, 0, w, h)
  shape.x = x
  shape.y = y
  return { x, y, w, h, vx, vy, shape }
}

// creates a 2x2 box centered at (x,y) with orientation randomly determined by orientationBias
function createTwoByTwo (x, y) {
  return Math.random() < orientationBiasFunction.evaluate({x, y, n: iteration})
    ? [createDomino(x-1, y-1, 2, 1, 0, -1), createDomino(x-1, y, 2, 1, 0, 1)]
    : [createDomino(x-1, y-1, 1, 2, -1, 0), createDomino(x, y-1, 1, 2, 1, 0)]
}

// Get a domino color based on its direction of movement
function computeDominoColor(vx, vy) {
  return vx === 1 ? eastwardColor : vx === -1 ? westwardColor : vy === 1 ? southwardColor : northwardColor
}

// Redraws the dominoes (e.g. after color is updated)
function redraw () {
  for (let domino of dominoes) {
    domino.shape.graphics
      .clear()
      .setStrokeStyle(DOMINO_BORDER_WIDTH)
      .beginStroke(DOMINO_BORDER_COLOR)
      .beginFill(computeDominoColor(domino.vx, domino.vy))
      .drawRect(0, 0, domino.w, domino.h)
  }
  stage.update()
}

function waitFor (time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

// Partitions an array into those items that satisfy a predicate and those that don't
function partition (arr, pred) {
  let res = [[], []]
  for (let item of arr) {
    res[pred(item) ? 0 : 1].push(item)
  }
  return res
}
