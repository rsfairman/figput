// Copyright 2022 Randall Fairman
"use strict";var theBrowser=function(){let blah=navigator.userAgent;if(blah.indexOf("Firefox")>-1)
return"Firefox";if(blah.indexOf("Chrome")>-1)
return"Chrome";console.log("MAKING DEFAULT 'CHROME' ASSUMPTION ABOUT THE BROWSWER!!!");return"Chrome";}();function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function getAugmentedFunction(fcnName){return window[fcnName];}
class PageData{constructor(){this.pageHeight=0;this.pageWidth=0;this.leftMargin=0;this.rightMargin=0;this.textWidth=0;this.insertPoint=[];this.deleteHeight=[];this.aboveHeight=[];this.belowHeight=[];this.name=[];this.done=[];this.drawFcn=[];}}
class PDFDocument{static async setPDF(thePDF){this.pdf=thePDF;this.numberOfPages=thePDF.numPages;for(let i=1;i<=this.numberOfPages;i++){await thePDF.getPage(i).then(function(page){PDFDocument.pageSpecs[i-1]=new PageData();PDFDocument.pageSpecs[i-1].pageWidth=page.view[2];PDFDocument.pageSpecs[i-1].pageHeight=page.view[3];PDFDocument.theCanvases[i-1]=null;PDFDocument.pageAge[i-1]=0;});}}
static isLoaded(){if(this.pdf===null)
return false;else
return true;}
static getZoom(){return this.zoom;}
static setZoom(z){this.zoom=z;this.flushBuffer();}
static getCanvas(n){if(this.theCanvases[n]===null)
console.log("ERROR! Canvas for page missing: "+n);return this.theCanvases[n];}
static async render(n){if(PDFDocument.theCanvases[n]!==null)
return;let thePage=await PDFDocument.pdf.getPage(n+1);let newCanvas=document.createElement('canvas');PDFDocument.theCanvases[n]=newCanvas;PDFDocument.pageAge[n]=PDFDocument.renderCount;++PDFDocument.renderCount;let offctx=newCanvas.getContext('2d');let viewport=thePage.getViewport(PDFDocument.zoom);newCanvas.width=viewport.width;newCanvas.height=viewport.height;await thePage.render({canvasContext:offctx,viewport:viewport});}
static trimBuffer(){let ctot=0;for(let i=0;i<PDFDocument.numberOfPages;i++){if(PDFDocument.theCanvases[i]!==null)
++ctot;}
while(ctot>PDFDocument.pageBufSize){PDFDocument.removeOldestPage();--ctot;}}
static removeOldestPage(){let oldestIndex=-1;let oldestAge=this.pageAge[0];for(let i=0;i<this.numberOfPages;i++){if(this.theCanvases[i]===null)
continue;if(this.pageAge[i]<oldestAge){oldestAge=this.pageAge[i];oldestIndex=i;}}
this.theCanvases[oldestIndex]=null;}
static flushBuffer(){for(let i=0;i<this.numberOfPages;i++)
this.theCanvases[i]=null;}}
PDFDocument.numberOfPages=0;PDFDocument.zoom=1;PDFDocument.pageSpecs=[];PDFDocument.pageBufSize=6;PDFDocument.theCanvases=[];PDFDocument.renderCount=0;PDFDocument.pageAge=[];class Events{static getID(){let answer=this.count;this.count++;return answer;}
static async waitMyTurn(id){while(id!==Events.complete+1)
await sleep(5);}
static allDone(id){Events.complete=id;}}
Events.count=0;Events.complete=-1;async function doOpenDocument(latexName,scrollPos){let theCanvas=document.getElementById("pdf_renderer");theCanvas.style.position="fixed";PDFDocument.setZoom(window.devicePixelRatio);adjustCanvas();theCanvas.addEventListener("mousedown",doMouseDown);theCanvas.addEventListener("mousemove",doMouseMove);theCanvas.addEventListener("mouseup",doMouseUp);await getDocumentData(latexName);FullPanel.init(PDFDocument.pageSpecs);adjustScrollBars();window.scrollTo(0,scrollPos);fullRender();}
async function getDocumentData(latexName){let thePDF=await pdfjsLib.getDocument(latexName+'.pdf');await PDFDocument.setPDF(thePDF);let fname=latexName+".fig.aux";let fetchPromise=await fetch(fname);let allText=await fetchPromise.text();await getFigureInfo(allText);}
async function syncLoad(scriptName){let theCode=document.createElement("script");theCode.type="application/javascript";theCode.src=scriptName;var p=new Promise((resolve,reject)=>{theCode.addEventListener("load",resolve,{once:true});theCode.addEventListener("error",reject,{once:true});});document.body.appendChild(theCode);await p;}
async function getFigureInfo(textBody){let lines=textBody.split('\n');for(let i=0;i<lines.length;i++){if(lines[i].length<2)
break;var parts=lines[i].split(' ');if(parts[0]==="load"){await syncLoad(parts[1]);continue;}
var pnum=parseInt(parts[0]);var innerMargin=parseFloat(parts[1]);var outerMargin=parseFloat(parts[2]);var textWidth=parseFloat(parts[3]);var vpos=parseFloat(parts[4]);var hLatex=parseFloat(parts[5]);var hAbove=parseFloat(parts[6]);var hBelow=parseFloat(parts[7]);var name=parts[8];var done=(parts[9]==='true');var externLoad=(parts[10]==='true');pnum-=1;if(externLoad===true)
await syncLoad(name+".fjs");let augFcn=getAugmentedFunction(name);if(typeof augFcn==="undefined")
alert(name+" not found. Is the function name correct?");augFcn.figurePanelClass=null;PDFDocument.pageSpecs[pnum].drawFcn.push(augFcn);vpos=PDFDocument.pageSpecs[pnum].pageHeight-vpos;if(pnum%2===0){PDFDocument.pageSpecs[pnum].leftMargin=innerMargin;PDFDocument.pageSpecs[pnum].rightMargin=outerMargin;}
else{PDFDocument.pageSpecs[pnum].leftMargin=outerMargin;PDFDocument.pageSpecs[pnum].rightMargin=innerMargin;}
PDFDocument.pageSpecs[pnum].textWidth=textWidth;PDFDocument.pageSpecs[pnum].insertPoint.push(vpos);PDFDocument.pageSpecs[pnum].deleteHeight.push(hLatex);PDFDocument.pageSpecs[pnum].aboveHeight.push(hAbove);PDFDocument.pageSpecs[pnum].belowHeight.push(hBelow);PDFDocument.pageSpecs[pnum].name.push(name);PDFDocument.pageSpecs[pnum].done.push(done);}
for(let i=0;i<PDFDocument.numberOfPages;i++){for(let fig=0;fig<PDFDocument.pageSpecs[i].name.length;fig++){let curName=PDFDocument.pageSpecs[i].name[fig];for(let subfig=fig+1;subfig<PDFDocument.pageSpecs[i].name.length;subfig++){if(curName===PDFDocument.pageSpecs[i].name[subfig]){alert("The figure name "+curName+" is used more than once.");throw new Error();}}
for(let j=i+1;j<PDFDocument.numberOfPages;j++){for(let subfig=0;subfig<PDFDocument.pageSpecs[j].name.length;subfig++){if(curName===PDFDocument.pageSpecs[j].name[subfig]){alert("The figure name "+curName+" is used more than once.");throw new Error();}}}}}}
function adjustScrollBars(){var body=document.getElementById("mainbody");let totHeight=FullPanel.totalHeight();let visHeight=document.documentElement.clientHeight;body.style.height=totHeight+"px";let visWidth=document.documentElement.clientWidth;let totWidth=FullPanel.getFullWidth();if(visWidth>totWidth){body.style.width="0px";return;}
body.style.width=totWidth+"px";}
function ctxTopLevelAdjust(){var canvas=document.getElementById("pdf_renderer");let ctx=canvas.getContext('2d');ctx.resetTransform();let visWidth=document.documentElement.clientWidth;let totWidth=FullPanel.getFullWidth();let z=PDFDocument.getZoom();if(visWidth>totWidth){let canvasCenter=canvas.width/2;let docCenter=FullPanel.getFullWidth()/2;docCenter*=PDFDocument.getZoom();ctx.translate(canvasCenter-docCenter,0);}
else{ctx.translate(-window.scrollX*PDFDocument.getZoom(),0);}
return ctx;}
async function fullRender(){var canvas=document.getElementById("pdf_renderer");var ctx=canvas.getContext('2d');ctx.resetTransform();let visWidth=document.documentElement.clientWidth;let z=PDFDocument.getZoom();ctx.clearRect(0,0,visWidth*z,document.documentElement.clientHeight*z);await FullPanel.renderAll(canvas.height);}
function adjustCanvas(){var canvas=document.getElementById("pdf_renderer");canvas.style.width=document.documentElement.clientWidth+"px";canvas.style.height=document.documentElement.clientHeight+"px";canvas.width=document.documentElement.clientWidth*window.devicePixelRatio;canvas.height=document.documentElement.clientHeight*window.devicePixelRatio;}
async function doScrollGuts(id){await Events.waitMyTurn(id);await fullRender();Events.allDone(id);}
function doScroll(){if(PDFDocument.isLoaded()==false)
return;let id=Events.getID();doScrollGuts(id);}
async function doResizeGuts(id){await Events.waitMyTurn(id);PDFDocument.flushBuffer();console.log("ratio: "+window.devicePixelRatio);adjustCanvas();PDFDocument.setZoom(window.devicePixelRatio);adjustScrollBars();await fullRender();Events.allDone(id);}
function doResize(){let id=Events.getID();doResizeGuts(id);}
async function mouseDownGuts(id,x,y){await Events.waitMyTurn(id);let visWidth=document.documentElement.clientWidth;let totWidth=FullPanel.getFullWidth();let canvas=document.getElementById("pdf_renderer");if(visWidth>totWidth){let canvasCenter=canvas.width/2;let docCenter=FullPanel.getFullWidth()/2;canvasCenter=canvasCenter/PDFDocument.getZoom();x=x-(canvasCenter-docCenter);}
else{x=x+window.scrollX;}
y=y+window.scrollY;FullPanel.mouseDown(x,y);Events.allDone(id);}
function doMouseDown(e){let id=Events.getID();mouseDownGuts(id,e.x,e.y);}
async function mouseMoveGuts(id,x,y){await Events.waitMyTurn(id);let visWidth=document.documentElement.clientWidth;let totWidth=FullPanel.getFullWidth();let canvas=document.getElementById("pdf_renderer");if(visWidth>totWidth){let canvasCenter=canvas.width/2;let docCenter=FullPanel.getFullWidth()/2;canvasCenter=canvasCenter/PDFDocument.getZoom();x=x-(canvasCenter-docCenter);}
else{x=x+window.scrollX;}
y=y+window.scrollY;FullPanel.mouseMove(x,y);Events.allDone(id);}
function doMouseMove(e){let id=Events.getID();mouseMoveGuts(id,e.x,e.y);}
async function mouseUpGuts(id,x,y){await Events.waitMyTurn(id);let visWidth=document.documentElement.clientWidth;let totWidth=FullPanel.getFullWidth();let canvas=document.getElementById("pdf_renderer");if(visWidth>totWidth){let canvasCenter=canvas.width/2;let docCenter=FullPanel.getFullWidth()/2;canvasCenter=canvasCenter/PDFDocument.getZoom();x=x-(canvasCenter-docCenter);}
else{x=x+window.scrollX;}
y=y+window.scrollY;FullPanel.mouseUp(x,y);Events.allDone(id);}
function doMouseUp(e){let id=Events.getID();mouseUpGuts(id,e.x,e.y);}
function doTikzClick(){for(let pi=0;pi<PDFDocument.pageSpecs.length;pi++){let pd=PDFDocument.pageSpecs[pi];if(pd.name.length===0)
continue;for(let fi=0;fi<pd.name.length;fi++){if(pd.done[fi]==true)
continue;let theFcn=pd.drawFcn[fi];if(theFcn.figurePanelClass===null)
continue;let ctx=new CTX(pd.name[fi]);theFcn(ctx);ctx.close();}}}
function doBeforeUnload(e){let req=new XMLHttpRequest();req.open("WHERE","bogus",false);req.setRequestHeader("Content-Type","text/plain;charset=UTF-8");let msg=window.scrollY.toString();req.send(msg);}
document.addEventListener('scroll',doScroll);window.addEventListener('resize',doResize);"use strict";class FullPanel{static init(specList){let cumV=0;for(let i=0;i<specList.length;i++){let pp=new PagePanel(i,specList[i],cumV);this.thePages[i]=pp;cumV+=pp.h;}}
static async renderAll(height){height=height/PDFDocument.getZoom();let ps=[];for(let i=0;i<this.thePages.length;i++){let p=this.thePages[i].preRender(height);ps.push(p);}
await Promise.all(ps);for(let i=0;i<this.thePages.length;i++)
this.thePages[i].render(height);PDFDocument.trimBuffer();}
static totalHeight(){let answer=0;for(let i=0;i<this.thePages.length;i++)
answer+=this.thePages[i].h;return answer;}
static getFullWidth(){if(this.totalWidth>0)
return this.totalWidth;for(let i=0;i<this.thePages.length;i++){let pp=this.thePages[i];if(pp.w>this.totalWidth)
this.totalWidth=pp.w;}
return this.totalWidth;}
static mouseDown(x,y){WidgetManager.focusOwner=null;let i=0;for(;i<this.thePages.length;i++){if(this.thePages[i].v>y){i-=1;break;}}
if(i===this.thePages.length)
i=this.thePages.length-1;if((i==this.thePages.length)||(i<0))
return;this.thePages[i].mouseDown(x,y);}
static mouseMove(x,y){if(WidgetManager.mouseOwner===null)
return;let i=0;for(;i<this.thePages.length;i++){if(this.thePages[i].v>y){i-=1;break;}}
if(i===this.thePages.length)
i=this.thePages.length-1;if((i==this.thePages.length)||(i<0))
return;this.thePages[i].mouseMove(x,y);}
static mouseUp(x,y){if(WidgetManager.mouseOwner===null)
return;let i=0;for(;i<this.thePages.length;i++){if(this.thePages[i].v>y){i-=1;break;}}
if(i===this.thePages.length)
i=this.thePages.length-1;if((i==this.thePages.length)||(i<0))
return;this.thePages[i].mouseUp(x,y);WidgetManager.mouseOwner=null;}}
FullPanel.thePages=[];FullPanel.totalWidth=-1;class PagePanel{constructor(pageNum,pageSpec,v){this.v=0;this.w=0;this.h=0;this.pageNum=0;this.parts=[];this.w=pageSpec.pageWidth;this.v=v;this.pageNum=pageNum;let s=pageSpec;if(s.insertPoint.length==0){let p=new PDFPanel(pageNum,this.v,0,0,this.v,this.w,s.pageHeight);this.h=s.pageHeight;this.parts=[p];}
else{let srcV=0;let destV=0;let totalV=v;for(let j=0;j<s.insertPoint.length;j++){let p=new PDFPanel(pageNum,this.v,srcV,destV,totalV,this.w,s.insertPoint[j]-srcV);destV+=s.insertPoint[j]-srcV;totalV+=s.insertPoint[j]-srcV;let f=new FigurePanel(this.v,destV,totalV,this.w,s.deleteHeight[j]+s.aboveHeight[j]+s.belowHeight[j],s.aboveHeight[j],s.belowHeight[j],s.leftMargin,s.textWidth,s.drawFcn[j]);srcV=s.insertPoint[j]+s.deleteHeight[j];destV+=s.deleteHeight[j]+s.aboveHeight[j]+s.belowHeight[j];totalV+=s.deleteHeight[j]+s.aboveHeight[j]+s.belowHeight[j];this.parts.push(p);this.parts.push(f);}
let p=new PDFPanel(pageNum,this.v,srcV,destV,totalV,this.w,s.pageHeight-srcV);this.parts.push(p);this.h=destV+s.pageHeight-srcV;}}
async preRender(height){let vpos=window.scrollY;if(this.v+this.h<vpos)
return;if(this.v>vpos+height)
return;await PDFDocument.render(this.pageNum);}
render(height){let vpos=window.scrollY;if(this.v+this.h<vpos)
return;if(this.v>vpos+height)
return;let ctx=ctxTopLevelAdjust();for(let i=0;i<this.parts.length;i++)
this.parts[i].render();let z=PDFDocument.getZoom();ctx.strokeStyle="black";ctx.strokeRect(0,0,this.w*z,this.h*z);}
mouseDown(x,y){y-=this.v;for(let i=0;i<this.parts.length;i++){let p=this.parts[i];if(p instanceof PDFPanel)
continue;if((p.destV<=y)&&(y<=p.destV+p.h))
return p.mouseDown(x,y);}}
mouseMove(x,y){y-=this.v;for(let i=0;i<this.parts.length;i++){let p=this.parts[i];if(p instanceof PDFPanel)
continue;if((p.destV<=y)&&(y<=p.destV+p.h))
p.mouseMove(x,y);}}
mouseUp(x,y){y-=this.v;for(let i=0;i<this.parts.length;i++){let p=this.parts[i];if((p.destV<=y)&&(y<=p.destV+p.h)){if(p instanceof PDFPanel)
WidgetManager.mouseOwner.mouseUp(10000000000000,10000000000000);else
p.mouseUp(x,y);}}}}
class SubPanel{constructor(v,totalV,w,h){this.destV=0;this.h=0;this.w=0;this.totalV=0;this.destV=v;this.totalV=totalV;this.w=w;this.h=h;}
render(){console.log("Error: called SubPanel.render()!");}
mouseDown(x,y){console.log("Error: called SubPanel.mouseDown()!");}
mouseMove(x,y){console.log("Error: called SubPanel.mouseMove()!");}
mouseUp(x,y){console.log("Error: called SubPanel.mouseUp()!");}}
class PDFPanel extends SubPanel{constructor(pageNum,offsetV,srcV,destV,totalV,w,h){super(destV,totalV,w,h);this.pageNum=0;this.srcV=0;this.offsetV=0;this.pageNum=pageNum;this.srcV=srcV;this.offsetV=offsetV;}
render(){let theCanvas=PDFDocument.getCanvas(this.pageNum);if(theCanvas===null){return;}
let z=PDFDocument.getZoom();let ctx=ctxTopLevelAdjust();ctx.translate(0,(this.offsetV-window.scrollY)*z);ctx.drawImage(theCanvas,0,this.srcV*z,theCanvas.width,this.h*z,0,this.destV*z,theCanvas.width,this.h*z);}}
class FigurePanel extends SubPanel{constructor(pageV,destV,totalV,w,h,upperPadding,lowerPadding,margin,textWidth,drawFcn){super(destV,totalV,w,h);this.pageV=0;this.margin=0;this.textWidth=0;this.lowerPadding=0;this.upperPadding=0;this.pageV=pageV;this.upperPadding=upperPadding;this.lowerPadding=lowerPadding;this.margin=margin;this.textWidth=textWidth;this.drawFcn=drawFcn;}
render(){let ctx=ctxTopLevelAdjust();let z=PDFDocument.getZoom();ctx.translate(0,(this.pageV-window.scrollY)*z);ctx.translate(0,this.destV*z);ctx.scale(z,z);ctx.clearRect(1,0,this.w-2,this.h);ctx=ctxTopLevelAdjust();ctx.translate(0,(this.pageV-window.scrollY)*z);ctx.translate(this.margin*z,(this.destV+this.h-this.lowerPadding)*z);ctx.scale(1,-1);ctx.scale(z,z);this.drawFcn.figurePanelClass=this;this.drawFcn(ctx);}
mouseDown(x,y){y-=this.destV;x-=this.margin;y=(this.h-y)-this.lowerPadding;WidgetManager.mouseDown(this.drawFcn,x,y);}
mouseMove(x,y){y-=this.destV;x-=this.margin;y=(this.h-this.lowerPadding)-y;WidgetManager.mouseMove(this.drawFcn,x,y);}
mouseUp(x,y){y-=this.destV;x-=this.margin;y=(this.h-this.lowerPadding)-y;WidgetManager.mouseUp(this.drawFcn,x,y);}}"use strict";class WidgetManager{static register(w){this.theList.push(w);if(WidgetManager.theWidgets.has(w.betterOwner))
WidgetManager.theWidgets.get(w.betterOwner).push(w);else
WidgetManager.theWidgets.set(w.betterOwner,[w]);}
static knownWidget(o,t,n){for(let i=0;i<this.theList.length;i++){let curW=this.theList[i];if(o!==curW.owner)
continue;if(t!==curW.type)
continue;if(n===curW.name)
return curW;}
return null;}
static mouseDown(theFig,x,y){if(WidgetManager.theWidgets.has(theFig)===false)
return;let wlist=WidgetManager.theWidgets.get(theFig);for(let i=0;i<wlist.length;i++){if(wlist[i].mouseDown(x,y)===true)
return;}}
static mouseMove(theFig,x,y){if(WidgetManager.mouseOwner===null)
return;if(WidgetManager.theWidgets.has(theFig)===false)
return;if(WidgetManager.mouseOwner.betterOwner!==theFig)
return;WidgetManager.mouseOwner.mouseMove(x,y);}
static mouseUp(theFig,x,y){if(WidgetManager.mouseOwner===null)
return;if(WidgetManager.theWidgets.has(theFig)===false)
return;if(WidgetManager.mouseOwner.betterOwner!==theFig)
WidgetManager.mouseOwner.mouseUp(10000000000000,10000000000000);WidgetManager.mouseOwner.mouseUp(x,y);}}
WidgetManager.theList=[];WidgetManager.theWidgets=new Map();WidgetManager.bogusCanvas=document.createElement('canvas');WidgetManager.bogusCtx=WidgetManager.bogusCanvas.getContext('2d');WidgetManager.mouseOwner=null;WidgetManager.focusOwner=null;function getCaller(){let stack=new Error().stack;if(theBrowser==="Firefox"){let caller=stack.split('\n')[2].trim();let callingFcn=caller.split('@')[0];return callingFcn;}
else if(theBrowser==="Chrome"){let caller=stack.split('\n')[3].trim();let callingFcn=caller.split(' ')[1];if(callingFcn.indexOf('.')>-1)
callingFcn=callingFcn.split('.')[1];return callingFcn;}
else{console.log("IMPOSSIBLE ERROR DUE TO UNKNOWN BROWSER TYPE!!!");return"";}}
class Widget{constructor(owner,type,x,y,scale,hide,name){this.owner="";this.type="";this.name="";this.widgetX=0;this.widgetY=0;this.scale=1.0;this.hide=true;this.owner=owner;this.type=type;this.widgetX=x;this.widgetY=y;this.scale=scale;this.hide=hide;this.name=name;this.betterOwner=getAugmentedFunction(owner);WidgetManager.register(this);}
draw(ctx){console.log("Called Widget.draw()!!!");}
mouseDown(x,y){console.log("Called Widget.mouseDown()!!! "+this.name);return false;}
mouseMove(x,y){console.log("Called Widget.mouseMove()!!!");}
mouseUp(x,y){console.log("Called Widget.mouseUp()!!!");}}
function doAnimation(theWidget){let id=Events.getID();doAnimationGuts(id,theWidget);}
async function doAnimationGuts(id,theWidget){await Events.waitMyTurn(id);await renderFrame(theWidget);theWidget.curStep+=theWidget.stepsPerFrame;theWidget.advanceFrame();Events.allDone(id);}
async function renderFrame(theWidget){let myFunc=getAugmentedFunction(theWidget.owner);let fpc=myFunc.figurePanelClass;await fpc.render();}
function getFigureRect(theWidget){let myFunc=getAugmentedFunction(theWidget.owner);let fpc=myFunc.figurePanelClass;let answer={w:fpc.textWidth,ha:fpc.h-fpc.lowerPadding,hb:fpc.lowerPadding};return answer;}
class AnimationWidget extends Widget{constructor(){super(...arguments);this.curStep=0;this.stepsPerFrame=1;this.animID=0;}
advanceFrame(){console.log("Calling abstract AnimationWidget.advanceFrame()!");}}
class LoopAnimWidget extends AnimationWidget{constructor(){super(...arguments);this.steps=100;this.start=0;this.timeStep=20;this.visSteps=true;this.visFastSlow=true;this.visPauseRun=true;this.visCircle=true;this.triGrab=true;this.pCircle=null;this.pUpStep=null;this.pDownStep=null;this.pFaster=null;this.pSlower=null;this.pPauseRun=null;this.aRunning=true;this.sCircle=false;this.sPauseRun=false;this.sFaster=false;this.sSlower=false;this.sUpStep=false;this.sDownStep=false;}
static register(ctx,x,y,scale,visWidget,steps,start,timeStep,visSteps,visFastSlow,visPauseRun,visCircle,triGrab,name){let type="LoopWidget";let caller=getCaller();let w=WidgetManager.knownWidget(caller,type,name);if(w!=null){w.draw(ctx);return w;}
w=new LoopAnimWidget(caller,type,x,y,scale,!visWidget,name);w.steps=steps;w.start=start;w.timeStep=timeStep;w.visSteps=visSteps;w.visFastSlow=visFastSlow;w.visPauseRun=visPauseRun;w.visCircle=visCircle;w.triGrab=triGrab;w.curStep=w.start;WidgetManager.register(w);w.animID=setInterval(doAnimation,w.timeStep,w);w.draw(ctx);return w;}
advanceFrame(){this.curStep+=this.stepsPerFrame;if(this.curStep>=this.steps)
this.curStep-=this.steps;}
draw(ctx){if(this.hide===true)
return;if(ctx instanceof CTX)
return;let saveT=ctx.getTransform();ctx.translate(this.widgetX,this.widgetY);ctx.scale(this.scale,this.scale);var p=new Path2D();var r=40;var cx=0;var cy=0;var circWidth=3;if(this.visCircle==true){p.ellipse(cx,cy,r,r,0,0,2*Math.PI);this.pCircle=new Path2D(p);ctx.lineWidth=circWidth;if(this.sCircle==true)
ctx.strokeStyle=LoopAnimWidget.sColor;else
ctx.strokeStyle="black";ctx.stroke(p);ctx.lineWidth=1;var loc=-2*Math.PI*this.curStep/this.steps;var triHeight=10;var triAngle=Math.PI/20;p=new Path2D();var x=cx+(r-circWidth/2)*Math.cos(loc);var y=cy+(r-circWidth/2)*Math.sin(loc);p.moveTo(x,y);x=cx+(r-triHeight)*Math.cos(loc+triAngle);y=cy+(r-triHeight)*Math.sin(loc+triAngle);p.lineTo(x,y);x=cx+(r-triHeight)*Math.cos(loc-triAngle);y=cy+(r-triHeight)*Math.sin(loc-triAngle);p.lineTo(x,y);p.closePath();ctx.strokeStyle="red";ctx.stroke(p);ctx.strokeStyle="black";}
let arrowOffset=18;let lowerGap=6;let arrowHeight=7;let arrowDepth=4;let arrowPairSpace=3;let arrowThick=1.25;if(this.visFastSlow===true){ctx.lineWidth=arrowThick;if(this.sFaster==true)
ctx.strokeStyle=LoopAnimWidget.sColor;else
ctx.strokeStyle="black";p=new Path2D();p.moveTo(cx+arrowOffset,cy-r-circWidth/2-lowerGap);p.lineTo(cx+arrowOffset+arrowDepth,cy-r-circWidth/2-lowerGap-arrowHeight);p.lineTo(cx+arrowOffset,cy-r-circWidth/2-lowerGap-2*arrowHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx+arrowOffset+arrowPairSpace,cy-r-circWidth/2-lowerGap);p.lineTo(cx+arrowOffset+arrowDepth+arrowPairSpace,cy-r-circWidth/2-lowerGap-arrowHeight);p.lineTo(cx+arrowOffset+arrowPairSpace,cy-r-circWidth/2-lowerGap-2*arrowHeight);ctx.stroke(p);this.pFaster=new Path2D();this.pFaster.rect(cx+arrowOffset-arrowThick,cy-r-circWidth/2-lowerGap-2*arrowHeight,arrowPairSpace+arrowDepth+2*arrowThick,2*arrowHeight);if(this.sSlower==true)
ctx.strokeStyle=LoopAnimWidget.sColor;else
ctx.strokeStyle="black";p=new Path2D();p.moveTo(cx-arrowOffset,cy-r-circWidth/2-lowerGap);p.lineTo(cx-arrowOffset-arrowDepth,cy-r-circWidth/2-lowerGap-arrowHeight);p.lineTo(cx-arrowOffset,cy-r-circWidth/2-lowerGap-2*arrowHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx-arrowOffset-arrowPairSpace,cy-r-circWidth/2-lowerGap);p.lineTo(cx-arrowOffset-arrowDepth-arrowPairSpace,cy-r-circWidth/2-lowerGap-arrowHeight);p.lineTo(cx-arrowOffset-arrowPairSpace,cy-r-circWidth/2-lowerGap-2*arrowHeight);ctx.stroke(p);this.pSlower=new Path2D();this.pSlower.rect(cx-arrowOffset-arrowPairSpace-arrowDepth-arrowThick,cy-r-circWidth/2-lowerGap-2*arrowHeight,arrowPairSpace+arrowDepth+2*arrowThick,2*arrowHeight);}
ctx.lineWidth=1;if(this.visPauseRun===true){let pauseSpace=3.25;let pauseThick=1.5;let pauseHeight=2*arrowHeight;let runThick=1.5;let runLeftRight=5;let runHeight=2*arrowHeight;if(this.sPauseRun==true)
ctx.strokeStyle=LoopAnimWidget.sColor;else
ctx.strokeStyle="black";if(this.aRunning===true){ctx.lineWidth=pauseThick;p=new Path2D();p.moveTo(cx+pauseSpace,cy-r-circWidth/2-lowerGap);p.lineTo(cx+pauseSpace,cy-r-circWidth/2-lowerGap-pauseHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx-pauseSpace,cy-r-circWidth/2-lowerGap);p.lineTo(cx-pauseSpace,cy-r-circWidth/2-lowerGap-pauseHeight);ctx.stroke(p);ctx.lineWidth=1;}
else{ctx.lineWidth=runThick;p=new Path2D();p.moveTo(cx-runLeftRight,cy-r-circWidth/2-lowerGap);p.lineTo(cx-runLeftRight,cy-r-circWidth/2-lowerGap-runHeight);p.lineTo(cx+runLeftRight,cy-r-circWidth/2-lowerGap-runHeight/2);p.closePath();ctx.stroke(p);}
this.pPauseRun=new Path2D();this.pPauseRun.rect(cx-runLeftRight-runThick,cy-r-circWidth/2-lowerGap-runHeight-runThick,2*runLeftRight+2*runThick,runHeight+2*runThick);}
ctx.lineWidth=1;if(this.visSteps===true){let stepSpace=20;let stepThick=2.0;let upperGap=8;let stepHeight=15;let stepArrowHeight=8;let stepArrowWidth=5;ctx.lineWidth=stepThick;if(this.sDownStep==true){ctx.strokeStyle=LoopAnimWidget.sColor;ctx.fillStyle=LoopAnimWidget.sColor;}
else{ctx.strokeStyle="black";ctx.fillStyle="black";}
p=new Path2D();p.moveTo(cx-stepSpace,cy+r+circWidth/2+upperGap);p.lineTo(cx-stepSpace,cy+r+circWidth/2+upperGap+stepHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx-stepSpace,cy+r+circWidth/2+upperGap-stepThick);p.lineTo(cx-stepSpace+stepArrowWidth,cy+r+circWidth/2+upperGap+stepArrowHeight-stepThick);p.lineTo(cx-stepSpace-stepArrowWidth,cy+r+circWidth/2+upperGap+stepArrowHeight-stepThick);p.closePath();ctx.fill(p);this.pDownStep=new Path2D();this.pDownStep.rect(cx-stepSpace-stepArrowWidth,cy+r+circWidth/2+upperGap-stepThick,2*stepArrowWidth,stepHeight+stepThick);if(this.sUpStep==true){ctx.strokeStyle=LoopAnimWidget.sColor;ctx.fillStyle=LoopAnimWidget.sColor;}
else{ctx.strokeStyle="black";ctx.fillStyle="black";}
p=new Path2D();p.moveTo(cx+stepSpace,cy+r+circWidth/2+upperGap);p.lineTo(cx+stepSpace,cy+r+circWidth/2+upperGap+stepHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx+stepSpace,cy+r+circWidth/2+upperGap+stepHeight+stepThick);p.lineTo(cx+stepSpace+stepArrowWidth,cy+r+circWidth/2+upperGap+stepHeight-stepArrowHeight+stepThick);p.lineTo(cx+stepSpace-stepArrowWidth,cy+r+circWidth/2+upperGap+stepHeight-stepArrowHeight+stepThick);p.closePath();ctx.fill(p);this.pUpStep=new Path2D();this.pUpStep.rect(cx+stepSpace-stepArrowWidth,cy+r+circWidth/2+upperGap,2*stepArrowWidth,stepHeight+stepThick);ctx.lineWidth=1;ctx.strokeStyle="black";ctx.fillStyle="black";stepThick=1.5;let stepSize=6;ctx.lineWidth=stepThick;p=new Path2D();p.moveTo(cx-stepSize,cy+r+circWidth/2+upperGap+2*stepSize);p.lineTo(cx,cy+r+circWidth/2+upperGap+2*stepSize);p.lineTo(cx,cy+r+circWidth/2+upperGap+stepSize);p.lineTo(cx+stepSize,cy+r+circWidth/2+upperGap+stepSize);p.lineTo(cx+stepSize,cy+r+circWidth/2+upperGap);ctx.stroke(p);}
ctx.lineWidth=1;ctx.setTransform(saveT);}
mouseDown(x,y){if(this.hide===true)
return false;x-=this.widgetX;y-=this.widgetY;x/=this.scale;y/=this.scale;WidgetManager.bogusCtx.resetTransform();if(this.pPauseRun!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pPauseRun,x,y);if(isin===true){this.sPauseRun=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pFaster!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pFaster,x,y);if(isin===true){this.sFaster=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pSlower!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pSlower,x,y);if(isin===true){this.sSlower=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pUpStep!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pUpStep,x,y);if(isin===true){this.sUpStep=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pDownStep!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pDownStep,x,y);if(isin===true){this.sDownStep=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pCircle!==null){WidgetManager.bogusCtx.lineWidth=15;let isin=WidgetManager.bogusCtx.isPointInStroke(this.pCircle,x,y);if(isin===true){this.sCircle=true;let alpha=-Math.atan2(y,x);if(alpha<0)
alpha+=2*Math.PI;this.curStep=Math.floor(this.steps*alpha/(2*Math.PI));WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
return false;}
mouseMove(x,y){if(this.hide===true)
return;x-=this.widgetX;y-=this.widgetY;x/=this.scale;y/=this.scale;WidgetManager.bogusCtx.resetTransform();if(this.sCircle===true){WidgetManager.bogusCtx.lineWidth=40;let isin=WidgetManager.bogusCtx.isPointInStroke(this.pCircle,x,y);if(isin==false)
return;let alpha=-Math.atan2(y,x);if(alpha<0)
alpha+=2*Math.PI;this.curStep=Math.floor(this.steps*alpha/(2*Math.PI));renderFrame(this);}}
mouseUp(x,y){if(this.hide===true)
return;x-=this.widgetX;y-=this.widgetY;x/=this.scale;y/=this.scale;WidgetManager.bogusCtx.resetTransform();this.sCircle=false;if(this.sPauseRun){let isin=WidgetManager.bogusCtx.isPointInPath(this.pPauseRun,x,y);if(isin===true){if(this.aRunning===true)
clearInterval(this.animID);else
this.animID=setInterval(doAnimation,this.timeStep,this);if(this.aRunning===true)
this.aRunning=false;else
this.aRunning=true;}
this.sPauseRun=false;}
if(this.sFaster===true){let isin=WidgetManager.bogusCtx.isPointInPath(this.pFaster,x,y);if(isin===true){this.timeStep/=1.4;if(this.timeStep<1)
this.timeStep=1;if(this.aRunning===true)
clearInterval(this.animID);this.animID=setInterval(doAnimation,this.timeStep,this);this.aRunning=true;}
this.sFaster=false;}
if(this.sSlower===true){let isin=WidgetManager.bogusCtx.isPointInPath(this.pSlower,x,y);if(isin===true){this.timeStep*=1.4;if(this.timeStep>1000)
this.timeStep=1000;if(this.aRunning===true)
clearInterval(this.animID);this.animID=setInterval(doAnimation,this.timeStep,this);this.aRunning=true;}
this.sSlower=false;}
if(this.sUpStep===true){let isin=WidgetManager.bogusCtx.isPointInPath(this.pUpStep,x,y);if(isin===true){this.stepsPerFrame*=1.25;if(this.stepsPerFrame>this.steps/3)
this.stepsPerFrame=this.steps/3;}
this.sUpStep=false;}
if(this.sDownStep===true){let isin=WidgetManager.bogusCtx.isPointInPath(this.pDownStep,x,y);if(isin===true){this.stepsPerFrame/=1.25;}
this.sDownStep=false;}
renderFrame(this);}}
LoopAnimWidget.Radius=41.5;LoopAnimWidget.TopHeight=24.5;LoopAnimWidget.BottomHeight=21.0;LoopAnimWidget.sColor="blue";class OpenAnimWidget extends AnimationWidget{constructor(){super(...arguments);this.barLength=100;this.timeStep=25;this.decay=1.0001;this.visSteps=true;this.visFastSlow=true;this.visPauseRun=true;this.visBar=true;this.barGrab=true;this.pBar=null;this.pDot=null;this.pFaster=null;this.pSlower=null;this.pPauseRun=null;this.pUpStep=null;this.pDownStep=null;this.aRunning=true;this.sDot=false;this.sFaster=false;this.sSlower=false;this.sPauseRun=false;this.sUpStep=false;this.sDownStep=false;}
static register(ctx,x,y,scale,width,visWidget,timeStep,decay,visSteps,visFastSlow,visPauseRun,visBar,barGrab,name){let type="OpenAnimWidget";let caller=getCaller();let w=WidgetManager.knownWidget(caller,type,name);if(w!=null){w.draw(ctx);return w;}
w=new OpenAnimWidget(caller,type,x,y,scale,!visWidget,name);w.barLength=width/scale;w.timeStep=timeStep;w.visSteps=visSteps;w.visFastSlow=visFastSlow;w.visPauseRun=visPauseRun;w.visBar=visBar;w.barGrab=barGrab;w.decay=1+1/decay;WidgetManager.register(w);w.animID=setInterval(doAnimation,w.timeStep,w);w.draw(ctx);return w;}
advanceFrame(){this.curStep+=this.stepsPerFrame;}
draw(ctx){if(this.hide===true)
return;if(ctx instanceof CTX)
return;let saveT=ctx.getTransform();ctx.translate(this.widgetX,this.widgetY);ctx.scale(this.scale,this.scale);var p=new Path2D();if(this.visBar==true){let indDotRadius=5.0;let barThick=3.0;let indDotThick=2.0;p.moveTo(0,indDotRadius+OpenAnimWidget.ControlsHeight);p.lineTo(this.barLength,indDotRadius+OpenAnimWidget.ControlsHeight);if(this.barGrab===true)
this.pBar=new Path2D(p);ctx.lineWidth=barThick;ctx.stroke(p);p=new Path2D();let dx=Math.pow(this.decay,this.curStep);dx=this.barLength*(1-1/dx);p.ellipse(dx,indDotRadius+OpenAnimWidget.ControlsHeight,indDotRadius,indDotRadius,0,0,2*Math.PI);if(this.barGrab===true)
this.pDot=new Path2D(p);if(this.sDot==true)
ctx.fillStyle=OpenAnimWidget.sColor;else
ctx.fillStyle="red";ctx.fill(p);ctx.lineWidth=indDotThick;ctx.strokeStyle="black";ctx.stroke(p);}
let pauseRunWidth=40;let stepsWidth=32;let intraGap=8;let cy=OpenAnimWidget.BarHeight-4;let cx=this.barLength/2;if(this.visSteps===true)
cx+=intraGap+(pauseRunWidth/2);let arrowHeight=7;if(this.visFastSlow===true){let arrowOffset=12;let arrowDepth=4;let arrowPairSpace=3;let arrowThick=1.25;ctx.lineWidth=arrowThick;if(this.sFaster==true)
ctx.strokeStyle=OpenAnimWidget.sColor;else
ctx.strokeStyle="black";p=new Path2D();p.moveTo(cx+arrowOffset,cy);p.lineTo(cx+arrowOffset+arrowDepth,cy+arrowHeight);p.lineTo(cx+arrowOffset,cy+2*arrowHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx+arrowOffset+arrowPairSpace,cy);p.lineTo(cx+arrowOffset+arrowDepth+arrowPairSpace,cy+arrowHeight);p.lineTo(cx+arrowOffset+arrowPairSpace,cy+2*arrowHeight);ctx.stroke(p);this.pFaster=new Path2D();this.pFaster.rect(cx+arrowOffset-arrowThick,cy,arrowPairSpace+arrowDepth+2*arrowThick,2*arrowHeight);if(this.sSlower==true)
ctx.strokeStyle=LoopAnimWidget.sColor;else
ctx.strokeStyle="black";p=new Path2D();p.moveTo(cx-arrowOffset,cy);p.lineTo(cx-arrowOffset-arrowDepth,cy+arrowHeight);p.lineTo(cx-arrowOffset,cy+2*arrowHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx-arrowOffset-arrowPairSpace,cy);p.lineTo(cx-arrowOffset-arrowDepth-arrowPairSpace,cy+arrowHeight);p.lineTo(cx-arrowOffset-arrowPairSpace,cy+2*arrowHeight);ctx.stroke(p);this.pSlower=new Path2D();this.pSlower.rect(cx-arrowOffset-arrowPairSpace-arrowDepth-arrowThick,cy,arrowPairSpace+arrowDepth+2*arrowThick,2*arrowHeight);ctx.strokeStyle="black";}
ctx.lineWidth=1;if(this.visPauseRun===true){let pauseSpace=3.25;let pauseThick=1.5;let pauseHeight=2*arrowHeight;let runThick=1.5;let runLeftRight=5;let runHeight=2*arrowHeight;if(this.sPauseRun==true)
ctx.strokeStyle=LoopAnimWidget.sColor;else
ctx.strokeStyle="black";if(this.aRunning===true){ctx.lineWidth=pauseThick;p=new Path2D();p.moveTo(cx+pauseSpace,cy);p.lineTo(cx+pauseSpace,cy+pauseHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx-pauseSpace,cy);p.lineTo(cx-pauseSpace,cy+pauseHeight);ctx.stroke(p);ctx.lineWidth=1;}
else{ctx.lineWidth=runThick;p=new Path2D();p.moveTo(cx-runLeftRight,cy);p.lineTo(cx-runLeftRight,cy+runHeight);p.lineTo(cx+runLeftRight,cy+runHeight/2);p.closePath();ctx.stroke(p);}
this.pPauseRun=new Path2D();this.pPauseRun.rect(cx-runLeftRight-runThick,cy-runThick,2*runLeftRight+2*runThick,runHeight+2*runThick);}
cy+=12.5;cx=this.barLength/2;if((this.visPauseRun===true)||(this.visFastSlow===true))
cx-=intraGap+stepsWidth/2;ctx.lineWidth=1;if(this.visSteps===true){let stepSpace=12;let stepThick=2.0;let stepHeight=12.5;let stepArrowHeight=5.0;let stepArrowWidth=4.0;ctx.lineWidth=stepThick;if(this.sDownStep===true){ctx.strokeStyle=OpenAnimWidget.sColor;ctx.fillStyle=OpenAnimWidget.sColor;}
else{ctx.strokeStyle="black";ctx.fillStyle="black";}
p=new Path2D();p.moveTo(cx-stepSpace,cy);p.lineTo(cx-stepSpace,cy-stepHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx-stepSpace,cy+stepThick);p.lineTo(cx-stepSpace+stepArrowWidth,cy-stepArrowHeight+stepThick);p.lineTo(cx-stepSpace-stepArrowWidth,cy-stepArrowHeight+stepThick);p.closePath();ctx.fill(p);this.pDownStep=new Path2D();this.pDownStep.rect(cx-stepSpace-stepArrowWidth,cy-stepHeight,2*stepArrowWidth,stepHeight+stepThick);if(this.sUpStep===true){ctx.strokeStyle=OpenAnimWidget.sColor;ctx.fillStyle=OpenAnimWidget.sColor;}
else{ctx.strokeStyle="black";ctx.fillStyle="black";}
p=new Path2D();p.moveTo(cx+stepSpace,cy+stepThick);p.lineTo(cx+stepSpace,cy+stepThick-stepHeight);ctx.stroke(p);p=new Path2D();p.moveTo(cx+stepSpace,cy-stepHeight);p.lineTo(cx+stepSpace+stepArrowWidth,cy-stepHeight+stepArrowHeight);p.lineTo(cx+stepSpace-stepArrowWidth,cy-stepHeight+stepArrowHeight);p.closePath();ctx.fill(p);this.pUpStep=new Path2D();this.pUpStep.rect(cx+stepSpace-stepArrowWidth,cy-stepHeight,2*stepArrowWidth,stepHeight+stepThick);ctx.lineWidth=1;ctx.strokeStyle="black";ctx.fillStyle="black";stepThick=1.5;let stepSize=5;ctx.lineWidth=stepThick;p=new Path2D();p.moveTo(cx-stepSize,cy-2*stepSize);p.lineTo(cx,cy-2*stepSize);p.lineTo(cx,cy-stepSize);p.lineTo(cx+stepSize,cy-stepSize);p.lineTo(cx+stepSize,cy);ctx.stroke(p);ctx.strokeStyle="black";}
ctx.lineWidth=1;ctx.setTransform(saveT);}
mouseDown(x,y){if(this.hide===true)
return false;x-=this.widgetX;y-=this.widgetY;x/=this.scale;y/=this.scale;WidgetManager.bogusCtx.resetTransform();if(this.pFaster!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pFaster,x,y);if(isin===true){this.sFaster=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pSlower!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pSlower,x,y);if(isin===true){this.sSlower=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pPauseRun!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pPauseRun,x,y);if(isin===true){this.sPauseRun=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pUpStep!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pUpStep,x,y);if(isin===true){this.sUpStep=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pDownStep!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pDownStep,x,y);if(isin===true){this.sDownStep=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
if(this.pDot!==null){WidgetManager.bogusCtx.lineWidth=2;let isin=WidgetManager.bogusCtx.isPointInStroke(this.pDot,x,y);if(isin===false)
isin=WidgetManager.bogusCtx.isPointInPath(this.pDot,x,y);if(isin===true){this.sDot=true;let ratio=this.barLength/(this.barLength-x);let s=Math.log(ratio)/Math.log(this.decay);if(s<0)
s=0;this.curStep=s;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
return false;}
mouseMove(x,y){if(this.hide===true)
return;x-=this.widgetX;y-=this.widgetY;x/=this.scale;y/=this.scale;WidgetManager.bogusCtx.resetTransform();if(this.sDot===true){WidgetManager.bogusCtx.lineWidth=20;let isin=WidgetManager.bogusCtx.isPointInStroke(this.pBar,x,y);if(isin==false)
return;let ratio=this.barLength/(this.barLength-x);let s=Math.log(ratio)/Math.log(this.decay);if(s<0)
s=0;this.curStep=s;renderFrame(this);}}
mouseUp(x,y){if(this.hide===true)
return;x-=this.widgetX;y-=this.widgetY;x/=this.scale;y/=this.scale;WidgetManager.bogusCtx.resetTransform();this.sDot=false;if(this.sFaster===true){let isin=WidgetManager.bogusCtx.isPointInPath(this.pFaster,x,y);if(isin===true){this.timeStep/=1.4;if(this.timeStep<1)
this.timeStep=1;if(this.aRunning===true)
clearInterval(this.animID);this.animID=setInterval(doAnimation,this.timeStep,this);this.aRunning=true;}
this.sFaster=false;}
if(this.sSlower===true){let isin=WidgetManager.bogusCtx.isPointInPath(this.pSlower,x,y);if(isin===true){this.timeStep*=1.4;if(this.timeStep>1000)
this.timeStep=1000;if(this.aRunning===true)
clearInterval(this.animID);this.animID=setInterval(doAnimation,this.timeStep,this);this.aRunning=true;}
this.sSlower=false;}
if(this.sPauseRun){let isin=WidgetManager.bogusCtx.isPointInPath(this.pPauseRun,x,y);if(isin===true){if(this.aRunning===true)
clearInterval(this.animID);else
this.animID=setInterval(doAnimation,this.timeStep,this);if(this.aRunning===true)
this.aRunning=false;else
this.aRunning=true;}
this.sPauseRun=false;}
if(this.sUpStep===true){let isin=WidgetManager.bogusCtx.isPointInPath(this.pUpStep,x,y);if(isin===true){this.stepsPerFrame*=1.25;}
this.sUpStep=false;}
if(this.sDownStep===true){let isin=WidgetManager.bogusCtx.isPointInPath(this.pDownStep,x,y);if(isin===true)
this.stepsPerFrame/=1.25;this.sDownStep=false;}
renderFrame(this);}}
OpenAnimWidget.BarHeight=6.0;OpenAnimWidget.ControlsHeight=20.0;OpenAnimWidget.TotalHeight=32.0;OpenAnimWidget.sColor="blue";class DraggableDotWidget extends Widget{constructor(){super(...arguments);this.pDot=null;this.selected=false;this.dotRadius=3.0;}
static register(ctx,x,y,name){let type="DraggableDotWidget";let caller=getCaller();let w=WidgetManager.knownWidget(caller,type,name);if(w!=null){return w;}
w=new DraggableDotWidget(caller,type,x,y,1.0,false,name);WidgetManager.register(w);return w;}
draw(ctx){if(this.hide===true)
return;let saveT=ctx.getTransform();ctx.translate(this.widgetX,this.widgetY);ctx.scale(this.scale,this.scale);let p=new FPath();let r=this.dotRadius;p.ellipse(0,0,r,r,0,0,2*Math.PI,true);this.pDot=p;if(this.selected===true)
ctx.fillStyle=DraggableDotWidget.sColor;else
ctx.fillStyle="red";ctx.fill(p);ctx.setTransform(saveT);}
mouseDown(x,y){if(this.hide===true)
return false;x-=this.widgetX;y-=this.widgetY;x/=this.scale;y/=this.scale;WidgetManager.bogusCtx.resetTransform();if(this.pDot!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pDot,x,y);if(isin===true){this.selected=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
return false;}
mouseMove(x,y){if(this.hide===true)
return;let wh=getFigureRect(this);wh.w-=2*this.dotRadius;wh.ha-=2*this.dotRadius;wh.hb-=2*this.dotRadius;if(x<=this.dotRadius)
return;if(x>=wh.w)
return;if(y<=-wh.hb)
return;if(y>=wh.ha)
return;if(this.selected===true){this.widgetX=x;this.widgetY=y;renderFrame(this);}}
mouseUp(x,y){if(this.hide===true)
return;if(this.selected===true){this.selected=false;let wh=getFigureRect(this);wh.w-=2*this.dotRadius;wh.ha-=2*this.dotRadius;wh.hb-=2*this.dotRadius;if((x>this.dotRadius)&&(x<wh.w)&&(y>-wh.hb)&&(y<wh.ha)){this.widgetX=x;this.widgetY=y;}
renderFrame(this);}}}
DraggableDotWidget.sColor="blue";class DraggableDrawWidget extends Widget{constructor(){super(...arguments);this.pDot=null;this.selected=false;this.drawFcn=null;this.drawSelFcn=null;this.testPosFcn=null;}
static register(ctx,x,y,drawFcn,drawSelFcn,testPosFcn,name){let type="DraggableDrawWidget";let caller=getCaller();let w=WidgetManager.knownWidget(caller,type,name);if(w!=null){return w;}
w=new DraggableDrawWidget(caller,type,x,y,1.0,false,name);w.drawFcn=drawFcn;w.drawSelFcn=drawSelFcn;w.testPosFcn=testPosFcn;WidgetManager.register(w);return w;}
draw(ctx){if(this.hide===true)
return;let saveT=ctx.getTransform();ctx.translate(this.widgetX,this.widgetY);ctx.scale(this.scale,this.scale);if(this.selected===true)
this.pDot=this.drawSelFcn(ctx);else
this.pDot=this.drawFcn(ctx);ctx.setTransform(saveT);}
mouseDown(x,y){if(this.hide===true)
return false;x-=this.widgetX;y-=this.widgetY;x/=this.scale;y/=this.scale;WidgetManager.bogusCtx.resetTransform();if(this.pDot!==null){let isin=WidgetManager.bogusCtx.isPointInPath(this.pDot,x,y);if(isin===true){this.selected=true;WidgetManager.mouseOwner=this;renderFrame(this);return true;}}
return false;}
mouseMove(x,y){if(this.hide===true)
return;let wh=getFigureRect(this);if(this.testPosFcn(x,y,wh.w,wh.ha,wh.hb)===false)
return;if(this.selected===true){this.widgetX=x;this.widgetY=y;renderFrame(this);}}
mouseUp(x,y){if(this.hide===true)
return;if(this.selected===true){this.selected=false;let wh=getFigureRect(this);if(this.testPosFcn(x,y,wh.w,wh.ha,wh.hb)===true){this.widgetX=x;this.widgetY=y;}
renderFrame(this);}}}
DraggableDrawWidget.sColor="blue";class NumberInputWidget extends Widget{constructor(){super(...arguments);this.theWidget=null;}
static register(ctx,x,y,v,name){let type="NumberInputWidget";let caller=getCaller();let w=WidgetManager.knownWidget(caller,type,name);if(w!=null){w.draw(ctx);return w;}
w=new NumberInputWidget(caller,type,x,y,1.0,false,name);WidgetManager.register(w);w.theWidget=document.createElement("input");w.theWidget.setAttribute("type","number");w.theWidget.value=v.toString();w.theWidget.style.position="absolute";w.theWidget.style.display="block";w.theWidget.style.left=400+"px";w.theWidget.style.top=900+"px";w.theWidget.style.width=50+"px";w.theWidget.style.height=10+"px";w.theWidget.style.zIndex="99";document.body.appendChild(w.theWidget);w.theWidget.onchange=function(){let myFunc=getAugmentedFunction(w.owner);let fpc=myFunc.figurePanelClass;fpc.render();};w.draw(ctx);return w;}
getValue(){return this.theWidget.value;}
draw(ctx){let myFunc=getAugmentedFunction(this.owner);let fpc=myFunc.figurePanelClass;let totalV=fpc.totalV;let vpos=fpc.totalV+fpc.h-this.widgetY;let hpos=this.widgetX;let canvas=document.getElementById("pdf_renderer");let visWidth=document.documentElement.clientWidth;let totWidth=FullPanel.getFullWidth();if(visWidth>totWidth){let canvasCenter=canvas.width/2;let docCenter=FullPanel.getFullWidth()/2;canvasCenter=canvasCenter/PDFDocument.getZoom();hpos=hpos+(canvasCenter-docCenter);}
else{hpos=hpos-window.scrollX;}
hpos+=fpc.margin;this.theWidget.style.top=vpos+"px";this.theWidget.style.left=hpos+"px";}}
class ButtonWidget extends Widget{constructor(){super(...arguments);this.theWidget=null;this.clickState=false;this.resetState=false;}
static register(ctx,x,y,text,name){let type="ButtonWidget";let caller=getCaller();let w=WidgetManager.knownWidget(caller,type,name);if(w!=null){w.draw(ctx);return w;}
w=new ButtonWidget(caller,type,x,y,1.0,false,name);WidgetManager.register(w);w.theWidget=document.createElement("button");w.theWidget.setAttribute("type","button");w.theWidget.style.fontSize="10px";w.theWidget.textContent=text;w.theWidget.style.position="absolute";w.theWidget.style.display="block";w.theWidget.style.left=400+"px";w.theWidget.style.top=900+"px";w.theWidget.style.height=18+"px";w.theWidget.style.zIndex="99";document.body.appendChild(w.theWidget);w.theWidget.addEventListener('click',()=>{if(w.clickState===false)
w.clickState=true;else{w.clickState=false;w.resetState=true;}
let myFunc=getAugmentedFunction(w.owner);let fpc=myFunc.figurePanelClass;fpc.render();},false);w.draw(ctx);return w;}
doClick(){if(this.clickState===false)
this.clickState=true;else
this.clickState=false;}
draw(ctx){let myFunc=getAugmentedFunction(this.owner);let fpc=myFunc.figurePanelClass;let vpos=fpc.totalV+fpc.h-this.widgetY;let hpos=this.widgetX;let canvas=document.getElementById("pdf_renderer");let visWidth=document.documentElement.clientWidth;let totWidth=FullPanel.getFullWidth();if(visWidth>totWidth){let canvasCenter=canvas.width/2;let docCenter=FullPanel.getFullWidth()/2;canvasCenter=canvasCenter/PDFDocument.getZoom();hpos=hpos+(canvasCenter-docCenter);}
else{hpos=hpos-window.scrollX;}
hpos+=fpc.margin;let w=this.theWidget;w.style.top=(vpos-parseInt(w.style.height,10))+"px";w.style.left=hpos+"px";}}"use strict";class Point2D{constructor(x,y){this._x=x;this._y=y;}
toString(){return"( "+this._x.toFixed(2)+","+this._y.toFixed(2)+")";}
get x(){return this._x;}
get y(){return this._y;}
copy(){return new Point2D(this._x,this._y);}
negate(){return new Point2D(-this._x,-this.y);}
negateSelf(){this._x=-this.x;this._y=-this.y;}
minus(p){return new Point2D(this._x-p.x,this._y-p.y);}
minusSelf(p){this._x-=p._x;this._y-=p._y;}
translate2(u,v){return new Point2D(u+this._x,v+this._y);}
translate(p){return new Point2D(p.x+this._x,p.y+this._y);}
translateSelf2(u,v){this._x+=u;this._y+=v;}
translateSelf(p){this._x+=p.x;this._y+=p.y;}
scale(s){return new Point2D(s*this._x,s*this._y);}
scaleSelf(s){this._x*=s;this._y*=s;}
rotate(theta){let c=Math.cos(theta);let s=Math.sin(theta);return new Point2D(c*this._x-s*this._y,s*this._x+c*this._y);}
rotateSelf(theta){let c=Math.cos(theta);let s=Math.sin(theta);let u=c*this._x-s*this._y;let v=s*this._x+c*this._y;this._x=u;this._y=v;}
rotateAbout(c,theta){let answer=new Point2D(this.x-c.x,this.y-c.y);answer=answer.rotate(theta);answer._x+=c.x;answer._y+=c.y;return answer;}
dot(a){return a.x*this._x+a.y*this._y;}
length(){return Math.sqrt(this._x**2+this._y**2);}
static dot(a,b){return a.dot(b);}
angleBetween(a){let cos=this.dot(a)/(this.length()*a.length());return Math.acos(cos);}
cliffordBetween(a){return Math.atan2(this.x*a.y-a.x*this.y,this.x*a.x+this.y*a.y);}}
class PathSegment{constructor(kind,d){this.type=PathSegment.UNKNOWN;this.type=kind;this.s=d;}
static getClose(){let d={};return new PathSegment(PathSegment.CLOSE,d);}
static getMoveTo(x,y){let d={x:x,y:y};return new PathSegment(PathSegment.MOVE_TO,d);}
static getLineTo(x,y){let d={x:x,y:y};return new PathSegment(PathSegment.LINE_TO,d);}
static getBezier(cx1,cy1,cx2,cy2,x,y){let d={cx1:cx1,cy1:cy1,cx2:cx2,cy2:cy2,x:x,y:y};return new PathSegment(PathSegment.BEZIER,d);}
static getQuadratic(cx,cy,x,y){let d={cx:cx,cy:cy,x:x,y:y};return new PathSegment(PathSegment.QUADRATIC,d);}
static getArc(x,y,r,a0,a1,ccw){let d={x:x,y:y,r:r,a0:a0,a1:a1,ccw:ccw};return new PathSegment(PathSegment.ARC,d);}
static getArcTo(x1,y1,x2,y2,r){let d={x1:x1,y1:y1,x2:x2,y2:y2,r:r};return new PathSegment(PathSegment.ARC_TO,d);}
static getEllipse(x,y,rx,ry,rot,a0,a1,ccw){let d={x:x,y:y,rx:rx,ry:ry,rot:rot,a0:a0,a1:a1,ccw:ccw};return new PathSegment(PathSegment.ELLIPSE,d);}
static getRect(x,y,w,h){let d={x:x,y:y,w:w,h:h};return new PathSegment(PathSegment.RECT,d);}}
PathSegment.MOVE_TO=1;PathSegment.LINE_TO=2;PathSegment.BEZIER=3;PathSegment.QUADRATIC=4;PathSegment.ARC=5;PathSegment.ARC_TO=6;PathSegment.ELLIPSE=7;PathSegment.RECT=8;PathSegment.CLOSE=9;PathSegment.UNKNOWN=-1;class FPath extends Path2D{constructor(){super();this.segs=[];}
addPath(p){for(let i=0;i<p.segs.length;i++)
this.segs.push(p.segs[i]);}
closePath(){super.closePath();this.segs.push(PathSegment.getClose());}
moveTo(x,y){super.moveTo(x,y);this.segs.push(PathSegment.getMoveTo(x,y));}
frontLineTo(x,y){let s=this.segs[0];if(s.type!=PathSegment.MOVE_TO)
console.log("ERROR: frontLineTo() doesn't start with moveTo(): "+s.type);let newfirst=PathSegment.getMoveTo(x,y);let m=s.s;let newsecond=PathSegment.getLineTo(m.x,m.y);this.segs[0]=newsecond;this.segs.unshift(newfirst);}
lineTo(x,y){super.lineTo(x,y);this.segs.push(PathSegment.getLineTo(x,y));}
bezierCurveTo(cx1,cy1,cx2,cy2,x,y){super.bezierCurveTo(cx1,cy1,cx2,cy2,x,y);this.segs.push(PathSegment.getBezier(cx1,cy1,cx2,cy2,x,y));}
quadraticCurveTo(cx,cy,x,y){super.quadraticCurveTo(cx,cy,x,y);this.segs.push(PathSegment.getQuadratic(cx,cy,x,y));}
translate(p){let answer=new FPath();for(let i=0;i<this.segs.length;i++){let s=this.segs[i];if(s.type==PathSegment.MOVE_TO){let m=s.s;answer.moveTo(m.x+p.x,m.y+p.y);}
else if(s.type==PathSegment.LINE_TO){let m=s.s;answer.lineTo(m.x+p.x,m.y+p.y);}
else if(s.type==PathSegment.BEZIER){let m=s.s;answer.bezierCurveTo(m.cx1+p.x,m.cy1+p.y,m.cx2+p.x,m.cy2+p.y,m.x+p.x,m.y+p.y);}
else if(s.type==PathSegment.ELLIPSE){let m=s.s;answer.ellipse(m.x+p.x,m.y+p.y,m.rx,m.ry,m.rot,m.a0,m.a1,m.ccw);}
else{console.log("whatever translattion you want, it's not done.");}}
return answer;}
rotate(a){let answer=new FPath();for(let i=0;i<this.segs.length;i++){let s=this.segs[i];if(s.type==PathSegment.MOVE_TO){let m=s.s;let p=new Point2D(m.x,m.y).rotate(a);answer.moveTo(p.x,p.y);}
else if(s.type==PathSegment.LINE_TO){let m=s.s;let p=new Point2D(m.x,m.y).rotate(a);answer.lineTo(p.x,p.y);}
else if(s.type==PathSegment.BEZIER){let m=s.s;let c1=new Point2D(m.cx1,m.cy1).rotate(a);let c2=new Point2D(m.cx2,m.cy2).rotate(a);let e=new Point2D(m.x,m.y).rotate(a);answer.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,e.x,e.y);}
else{console.log("whatever rotation you want, it's not done.");}}
return answer;}
scale(r){let answer=new FPath();for(let i=0;i<this.segs.length;i++){let s=this.segs[i];if(s.type==PathSegment.MOVE_TO){let m=s.s;let p=new Point2D(r*m.x,r*m.y);answer.moveTo(p.x,p.y);}
else if(s.type==PathSegment.LINE_TO){let m=s.s;console.log("scale not done for lines");}
else if(s.type==PathSegment.BEZIER){let m=s.s;let c1=new Point2D(r*m.cx1,r*m.cy1);let c2=new Point2D(r*m.cx2,r*m.cy2);let p=new Point2D(r*m.x,r*m.y);answer.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,p.x,p.y);}
else{console.log("whatever scale you want, it's not done.");}}
return answer;}
reflectX(){let answer=new FPath();for(let i=0;i<this.segs.length;i++){let s=this.segs[i];if(s.type==PathSegment.MOVE_TO){let m=s.s;let p=new Point2D(m.x,-m.y);answer.moveTo(p.x,p.y);}
else if(s.type==PathSegment.LINE_TO){let m=s.s;let p=new Point2D(m.x,-m.y);answer.lineTo(p.x,p.y);}
else if(s.type==PathSegment.BEZIER){let m=s.s;let c1=new Point2D(m.cx1,-m.cy1);let c2=new Point2D(m.cx2,-m.cy2);let p=new Point2D(m.x,-m.y);answer.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,p.x,p.y);}
else if(s.type==PathSegment.ELLIPSE){let m=s.s;answer.ellipse(m.x,-m.y,m.rx,m.ry,m.rot,m.a0,m.a1,m.ccw);}
else{console.log("whatever reflect you want, it's not done.");}}
return answer;}
reflectXY(){let answer=new FPath();for(let i=0;i<this.segs.length;i++){let s=this.segs[i];if(s.type==PathSegment.MOVE_TO){let m=s.s;let p=new Point2D(-m.x,-m.y);answer.moveTo(p.x,p.y);}
else if(s.type==PathSegment.LINE_TO){let m=s.s;console.log("reflect not done for lines");}
else if(s.type==PathSegment.BEZIER){let m=s.s;let c1=new Point2D(-m.cx1,-m.cy1);let c2=new Point2D(-m.cx2,-m.cy2);let p=new Point2D(-m.x,-m.y);answer.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,p.x,p.y);}
else{console.log("whatever reflect you want, it's not done.");}}
return answer;}
rotateAbout(a,p){let t1=this.translate(new Point2D(-p.x,-p.y));let t2=t1.rotate(a);return t2.translate(p);}
static arcToBezierNEW(r,a0,a1){let totalAngle=a1-a0;if(totalAngle<0)
totalAngle+=2*Math.PI;let numCurves=Math.ceil(4*totalAngle/Math.PI);let subtend=totalAngle/numCurves;let k=(4/3)*Math.tan(subtend/4);let s=Math.sin(subtend);let c=Math.cos(subtend);let p1=new Point2D(r,0);let p2=new Point2D(r,r*k);let p3=new Point2D(r*(c+k*s),r*(s-k*c));let p4=new Point2D(r*c,r*s);let answer=new FPath();answer.moveTo(p1.x,p1.y);for(let i=0;i<numCurves;i++){answer.bezierCurveTo(p2.x,p2.y,p3.x,p3.y,p4.x,p4.y);p2.rotateSelf(subtend);p3.rotateSelf(subtend);p4.rotateSelf(subtend);}
answer=answer.rotate(a0);return answer;}
arc(x,y,r,a0,a1,ccw){if(ccw===undefined)
ccw=false;while(a0<0)
a0+=2*Math.PI;while(a1<0)
a1+=2*Math.PI;while(a0>=2*Math.PI)
a0-=2*Math.PI;while(a1>=2*Math.PI)
a1-=2*Math.PI;if(ccw===true){let temp=a1;a1=a0;a0=temp;}
let arcs=FPath.arcToBezierNEW(r,a0,a1);arcs=arcs.translate(new Point2D(x,y));this.addPath(arcs);}
ellipse(x,y,rx,ry,rot,a0,a1,ccw){if(ccw===undefined)
ccw=false;super.ellipse(x,y,rx,ry,rot,a0,a1,ccw);this.segs.push(PathSegment.getEllipse(x,y,rx,ry,rot,a0,a1,ccw));}
rect(x,y,w,h){super.rect(x,y,w,h);this.segs.push(PathSegment.getRect(x,y,w,h));}
static circArcToBezier(r,a0,a1){let answer=FPath.arcToBezierNEW(r,a0,a1);return answer;}
static parametricToBezier(f,t0,t1,n){let p=new FPath();let p1=f(t0);p.moveTo(p1.x,p1.y);for(let i=0;i<n;i++){let p4=f(t0+(i+1)*(t1-t0)/n);let B=f(t0+(i+0.5)*(t1-t0)/n);let d1=Math.sqrt((B.x-p1.x)**2+(B.y-p1.y)**2);let d2=Math.sqrt((B.x-p4.x)**2+(B.y-p4.y)**2);let t=d1/(d1+d2);let V=new Point2D(p4.x-p1.x,p4.y-p1.y);let e1=new Point2D(B.x-(1-t)*V.x/3,B.y-(1-t)*V.y/3);let e2=new Point2D(B.x+t*V.x/3,B.y+t*V.y/3);let r=1-1/(t**3+(1-t)**3);let u=(1-r)*(1-t)**3;let C=new Point2D(p1.x*u+p4.x*(1-u),p1.y*u+p4.y*(1-u));let A=new Point2D(B.x+(C.x-B.x)/r,B.y+(C.y-B.y)/r);let v1=new Point2D((e1.x-A.x*t)/(1-t),(e1.y-A.y*t)/(1-t));let v2=new Point2D((e2.x-A.x*(1-t))/t,(e2.y-A.y*(1-t))/t);let p2=new Point2D((v1.x-p1.x*(1-t))/t,(v1.y-p1.y*(1-t))/t);let p3=new Point2D((v2.x-p4.x*t)/(1-t),(v2.y-p4.y*t)/(1-t));p.bezierCurveTo(p2.x,p2.y,p3.x,p3.y,p4.x,p4.y);p1=p4.copy();}
return p;}}
function drawText(ctx,txt,x,y,dx=0,dy=0){let saveT=ctx.getTransform();if(ctx instanceof CTX){ctx.fillText(txt,x+dx,y+dy);ctx.setTransform(saveT);return;}
let m=ctx.measureText(txt);ctx.translate(0,y);ctx.scale(1,-1);ctx.textBaseline='bottom';ctx.fillText(txt,x,0);ctx.setTransform(saveT);}
function drawTextBrowserOnly(ctx,txt,x,y,dx=0,dy=0){if(ctx instanceof CTX)
return;drawText(ctx,txt,x,y,dx,dy);}
function drawTextTikZOnly(ctx,txt,x,y,dx=0,dy=0){if(ctx instanceof CTX)
ctx.fillText(txt,x+dx,y+dy);}
class CTX{constructor(name){this.tmatrix=[[1,0,0],[0,1,0],[0,0,1]];this.netScale=1.0;this.lineWidth=1.0;this.figureName="";this.tikzstr="";this.figureName=name;this.tikzstr="";this.tikzstr+="\\begin{tikzpicture}\n";let myFunc=getAugmentedFunction(name);let fpc=myFunc.figurePanelClass;this.tikzstr+="\\useasboundingbox (0bp,0bp) rectangle ("+fpc.textWidth.toFixed(2)+"bp,"+(fpc.h-fpc.lowerPadding-fpc.upperPadding).toFixed(2)+"bp);\n";}
close(){this.tikzstr+="\\end{tikzpicture}\n";let req=new XMLHttpRequest();let fname=this.figureName+".tikz";req.open("POST",fname);req.setRequestHeader("Content-Type","text/plain;charset=UTF-8");req.send(this.tikzstr);}
static clone3x3Matrix(m){let a=[];a[0]=[];a[0][0]=m[0][0];a[0][1]=m[0][1];a[0][2]=m[0][2];a[1]=[];a[1][0]=m[1][0];a[1][1]=m[1][1];a[1][2]=m[1][2];a[2]=[];a[2][0]=m[2][0];a[2][1]=m[2][1];a[2][2]=m[2][2];return a;}
getTransform(){return CTX.clone3x3Matrix(this.tmatrix);}
setTransform(t){this.tmatrix=CTX.clone3x3Matrix(t);}
translate(tx,ty){this.tmatrix[0][2]+=tx;this.tmatrix[1][2]+=ty;}
scale(sx,sy){this.tmatrix[0][0]*=sx;this.tmatrix[0][1]*=sy;this.tmatrix[1][0]*=sx;this.tmatrix[1][1]*=sy;this.netScale*=sx;}
applyTMatrix(x,y){let ax=this.tmatrix[0][0]*x+this.tmatrix[0][1]*y+this.tmatrix[0][2];let ay=this.tmatrix[1][0]*x+this.tmatrix[1][1]*y+this.tmatrix[1][2];return{x:ax,y:ay};}
handlePath(path){var segs=path.segs;for(let i=0;i<segs.length;i++){let s=segs[i];if(s.type==PathSegment.MOVE_TO){let m=s.s;let t=this.applyTMatrix(m.x,m.y);this.tikzstr+="("+t.x.toFixed(2)+"bp, "+t.y.toFixed(2)+"bp) ";}
else if(s.type==PathSegment.LINE_TO){let m=s.s;let t=this.applyTMatrix(m.x,m.y);this.tikzstr+="-- ("+t.x.toFixed(2)+"bp, "+t.y.toFixed(2)+"bp) ";}
else if(s.type==PathSegment.BEZIER){let m=s.s;let t1=this.applyTMatrix(m.cx1,m.cy1);let t2=this.applyTMatrix(m.cx2,m.cy2);let t3=this.applyTMatrix(m.x,m.y);this.tikzstr+=".. controls ("+t1.x.toFixed(2)+"bp, "+t1.y.toFixed(2)+"bp) and ("+
t2.x.toFixed(2)+"bp, "+t2.y.toFixed(2)+"bp) .. ("+
t3.x.toFixed(2)+"bp, "+t3.y.toFixed(2)+"bp)";}
else if(s.type==PathSegment.QUADRATIC){console.log("quadratic does not work");}
else if(s.type==PathSegment.ARC){console.log("arc");this.tikzstr+="no arc implemented";}
else if(s.type==PathSegment.ARC_TO){console.log("arc to not done");this.tikzstr+="no arcTo implemented";}
else if(s.type==PathSegment.ELLIPSE){let m=s.s;let c=this.applyTMatrix(m.x,m.y);this.tikzstr+="("+c.x.toFixed(2)+"bp,"+c.y.toFixed(2)+"bp) ellipse [x radius="+(m.rx*this.netScale).toFixed(2)+"bp,y radius ="+(m.ry*this.netScale).toFixed(2)+"bp]";}
else if(s.type==PathSegment.RECT){console.log("rect not done");this.tikzstr+="no rect implemented";}
else if(s.type==PathSegment.CLOSE){this.tikzstr+="-- cycle";}
else{console.log("unknown FPath: "+s.type);}}
this.tikzstr+=";\n";}
stroke(path){let segs=path.segs;if(segs.length===0)
return;this.tikzstr+="\\draw[line width="+this.lineWidth.toFixed(2)+"bp] ";this.handlePath(path);}
fill(path){let segs=path.segs;if(segs.length===0)
return;this.tikzstr+="\\fill ";this.handlePath(path);}
fillText(s,x,y){let t=this.applyTMatrix(x,y);this.tikzstr+="\\node [anchor=base west] at ("+t.x.toFixed(2)+"pt, "+t.y.toFixed(2)+"pt) {"+s+"};\n";}}
class Numerical{static newton(f,g,a,b,y,e){let x0=g;let y0=f(x0);let i=0;while(Math.abs(y-y0)>e){let fplus=f(x0+e);let fminus=f(x0-e);let fprime=(fplus-fminus)/(2*e);let dx=(y-y0)/fprime;let x1=x0+dx;if(x1>b)
x1=(x1-x0)/2;if(x1<a)
x1=(x0-x1)/2;x0=x1;y0=f(x0);++i;if(i>100)
return x0;}
return x0;}}