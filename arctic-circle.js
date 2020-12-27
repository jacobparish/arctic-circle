const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const CANVAS_SCALE = 20
const DOMINO_BORDER_COLOR = "Black"
const DOMINO_BORDER_WIDTH = 0.04

let stage
let step
let dominoes

// play/pause controls
let isPlaying = false
let playInterval
let playSpeed = 1500
let timeout

// other controls
let orientationBias = 0.5
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

  doReset()

  document.getElementById('orientation-bias-input').addEventListener('input', event => {
    orientationBias = event.target.value
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

  step = 1

  // create the first 2 dominoes
  dominoes = createTwoByTwo(0, 0)
  stage.addChild(...dominoes.map(d => d.shape))
}

// Simulate a single step
function doStep () {
  step += 1

  // destroy dominoes that will collide
  // we could do better than O(n^2) here but this seemed easier
  for (let i = 0; i < dominoes.length; i++) {
    for (let j = 0; j < dominoes.length; j++) {
      if (i === j) continue

      let d1 = dominoes[i]
      let d2 = dominoes[j]
      if (d1.w === 1 && d2.w === 1) {
        if (d1.y === d2.y && d1.x === d2.x + 1 && d1.vx === -1 && d2.vx === 1) {
          d1.shouldDestroy = d2.shouldDestroy = true
        }
      } else if (d1.h === 1 && d2.h === 1) {
        if (d1.x === d2.x && d1.y === d2.y + 1 && d1.vy === -1 && d2.vy === 1) {
          d1.shouldDestroy = d2.shouldDestroy = true
        }
      }
    }
  }

  // update the domino positions
  for (let domino of dominoes) {
    domino.x += domino.vx
    domino.y += domino.vy
  }

  // make a 2D boolean array to hold all the occupied (false) and non-occupied (true) positions
  let grid = []
  for (let i = 0; i < step; i++) {
    grid.push(Array(step * 2).fill(false).fill(true, step - i - 1, step + i + 1))
  }
  for (let i = 0; i < step; i++) {
    grid.push(Array(step * 2).fill(false).fill(true, i, 2 * step - i))
  }

  // mark the spaces that are currently occupied by dominoes
  for (let domino of dominoes) {
    if (domino.shouldDestroy) continue

    for (let x = domino.x; x < domino.x + domino.w; x++) {
      for (let y = domino.y; y < domino.y + domino.h; y++) {
        grid[y+step][x+step] = false
      }
    }
  }

  // search for 2x2 boxes to spawn new dominoes
  let dominoesToAdd = []
  for (let x = 0; x < 2 * step - 1; x++) {
    for (let y = 0; y < 2 * step - 1; y++) {
      if (grid[y][x] && grid[y+1][x] && grid[y][x+1] && grid[y+1][x+1]) {
        dominoesToAdd.push(...createTwoByTwo(x-step+1, y-step+1))
        // mark the spaces as occupied
        grid[y][x] = grid[y+1][x] = grid[y][x+1] = grid[y+1][x+1] = false
      }
    }
  }

  // do domino animations for this step
  for (let domino of dominoes) {
    const newProps = { x: domino.x, y: domino.y }

    // fade out dominoes that should be destroyed
    if (domino.shouldDestroy) {
      newProps.alpha = 0
    }

    createjs.Tween.get(domino.shape).to(newProps, playSpeed * .25, createjs.Ease.getPowInOut(2))
  }

  const [dominoesToDestroy, dominoesToKeep] = partition(dominoes, d => d.shouldDestroy)

  dominoes = [...dominoesToKeep, ...dominoesToAdd]

  timeout = setTimeout(() => {
    stage.addChild(...dominoesToAdd.map(d => d.shape))
    stage.removeChild(...dominoesToDestroy.map(d => d.shape))

    // after 14 steps, we adjust the transform so that the dominoes continue to stay within the canvas bounds
    if (step >= 14) {
      createjs.Tween.get(stage)
        .to({ scale: CANVAS_SCALE * 14 / step }, playSpeed * .25, createjs.Ease.getPowInOut(2))
    }
  }, playSpeed * .5)
}

function togglePlay () {
  isPlaying = !isPlaying
  document.getElementById('play-toggle-button').innerText = isPlaying ? 'Pause' : 'Play'
  if (isPlaying) {
    doStep()
    playInterval = setInterval(doStep, playSpeed)
  } else {
    clearInterval(playInterval)
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
  return Math.random() < orientationBias
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

// Partitions an array into those items that satisfy a predicate and those that don't
function partition (arr, pred) {
  let res = [[], []]
  for (let item of arr) {
    res[pred(item) ? 0 : 1].push(item)
  }
  return res
}
