
// This file demonstrates two things: how to use an external js
// file, and use of the DraggableDrawWidget.

// Functions passed to DraggableDrawWidgets

function getRawSquare() {
  
  // The 'radius' of a square.
  let r = 3;
  let p = new FPath();
  p.moveTo(-r,-r);
  p.lineTo(r,-r);
  p.lineTo(r,r);
  p.lineTo(-r,r);
  p.closePath();

  return p;
}

function drawSquareDot(ctx) {

  let p = getRawSquare();
  ctx.fillStyle='red';
  ctx.fill(p);
  return p;
}

function drawSquareDotSelect(ctx) {

  let p = getRawSquare();
  ctx.fillStyle='green';
  ctx.fill(p);
  return p;
}

function squareLocationOK(x,y,w,ha,hb) {

  // A bit of padding so that we don't leave "crumbs" around the edges.
  let pad = 5;
  
  if (x < pad) return false;
  if (x > w - pad) return false;

  // Note the minus sign. We need to compare to y, which may be negative.
  if (y < -hb + pad ) return false;
  if (y > ha - pad ) return false;
  return true;
}


// The top-level figure-drawing function.

function bezier(ctx) {
    
  let w1 = DraggableDotWidget.register(ctx,70,165,'d1');
  let w2 = DraggableDrawWidget.register(ctx,30,115,
    drawSquareDot,drawSquareDotSelect,squareLocationOK,'d2');
  let w3 = DraggableDrawWidget.register(ctx,120,25,
    drawSquareDot,drawSquareDotSelect,squareLocationOK,'d3');
  let w4 = DraggableDotWidget.register(ctx,270,105,'d4');

  let p = new FPath();

  // Straight lines from point to point.
  p.moveTo(w1.widgetX,w1.widgetY);
  p.lineTo(w2.widgetX,w2.widgetY);
  p.lineTo(w3.widgetX,w3.widgetY);
  p.lineTo(w4.widgetX,w4.widgetY);
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 0.4;
  ctx.stroke(p);

  // Bezier curve determined by these points.
  p = new FPath();
  p.moveTo(w1.widgetX,w1.widgetY);
  p.bezierCurveTo(w2.widgetX,w2.widgetY,
    w3.widgetX,w3.widgetY,w4.widgetX,w4.widgetY);
  ctx.strokeStyle = 'blue';
  ctx.lineWidth = 1.5;
  ctx.stroke(p);

  // In this case (unlike most others), the widgets must be explicitly drawn.
  w1.draw(ctx);
  w2.draw(ctx);
  w3.draw(ctx);
  w4.draw(ctx);
}

