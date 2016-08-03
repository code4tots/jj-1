// jj package: simple.canvas
// jshint esversion: 6

class Canvas extends jjObject {
  constructor(stack) {
    super();
    const canvas = document.createElement("canvas");
    if (!canvas.getContext) {
      throw new Error("Canvas element not supported!");
    }
    this.dom = canvas;
    this.ctx = canvas.getContext("2d");
    canvas.setAttribute("width", 300);
    canvas.setAttribute("height", 300);
    canvas.style.outline = "thin solid blue";
    canvas.style.margin = "auto";
    canvas.style.position = "absolute";
    canvas.style.top = 0;
    canvas.style.bottom = 0;
    canvas.style.right = 0;
    canvas.style.left = 0;
  }
  aagetWidth(stack) {
    return this.dom.width;
  }
  aagetHeight(stack) {
    return this.dom.height;
  }
  aasetWidth(stack, width) {
    this.dom.width = width;
  }
  aasetHeight(stack, height) {
    this.dom.height = height;
  }
  aasetFillStyle(stack, style) {
    this.ctx.fillStyle = style;
  }
  aasetStrokeStyle(stack, style) {
    this.ctx.strokeStyle = style;
  }
  aafillRect(stack, x, y, width, height) {
    this.ctx.fillRect(x, y, width, height);
  }
  aasetFont(stack, font) {
    this.ctx.font = font;
  }
  aafillText(stack, text, x, y, maxWidth) {
    this.ctx.fillText(text, x, y, maxWidth);
  }
  aagetTextWidth(stack, text) {
    return this.ctx.measureText(text).width;
  }
}

function installCanvas(stack, canvas) {
  document.body.appendChild(canvas.dom);
}

exports.aaCanvas = Canvas;
exports.aainstallCanvas = installCanvas;
