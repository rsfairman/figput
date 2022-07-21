/* 

Main entry point for all the js code behind the browser interface.
 
This has the initialization code, to load the pdf and the data specifying 
how figures are drawn and laid out, plus the top-level stuff to direct 
events to the proper place for handling.

The same code is used for developing the document, and for serving it
from a public-facing website, with a few changes. Look for "PUBLIC FACING"
annotations. Note also that it would be possible to strip considerably
more code away for the public-facing version, but there's no pressing
reason to do it -- the savings would be tiny -- and it could lead to
an error of some kind due to unforeseen dependencies on the deleted
code.

*/


// In rare cases, I need to know the browser. Note it first, before doing
// anything else. This userAgent is a longish bit of blather specifying
// the browser, and the easiest way to deal with it is to check whether
// certain strings appear.

var theBrowser = function() {
  
  let blah = navigator.userAgent;
  
  if (blah.indexOf("Firefox") > -1)
    return "Firefox";
  
  // MS Edge is also "Chrome," at least for my purposes.
  if (blah.indexOf("Chrome") > -1) 
    return "Chrome";
  
  // Assume "Chrome" as the default.
  console.log("MAKING DEFAULT 'CHROME' ASSUMPTION ABOUT THE BROWSWER!!!");
  return "Chrome";
}(); 


// JS has poor to non-existent facilities for dealing with thread scheduling.
// In a lot of JS code that doesn't matter, but the pdf.js library, on which
// this entire thing rests, makes heavy use of Promises and workers. Fortunately, 
// there's a simple way of managing this. 
//
// To use this, the caller says
// await sleep(100);
// and the "await" is crucial. This works because setTimeout() takes a 
// function to run, and some amount of time to wait before running that
// function. 
//
// This isn't a satisfying solution because it requires "await."
// For that reason it can only be used in async functions.

function sleep(ms : number) : Promise<unknown> {
  
  // ms is milliseconds, not microseconds. 
  return new Promise(resolve => setTimeout(resolve,ms));
}


// Some semi-bogus stuff to quiet the ts compiler...

// This makes the external library known to tsc.
declare var pdfjsLib : any;

// And this provides the properties known to pdfjs that belong to a pdf. 
// I had hoped to define a blank type, and have done with it, but we need 
// access to certain fields. This provides the type information that
// pdf.js lacks -- or at least the minimal information that I need.
type LoadedPDF = {
  numPages : number;
  getPage : (n : number) => Promise<any>;
};

// This is less bogus. It's the type of the functions called to draw the figures.
// These functions have an added property that points to the
// correct FigurePanel widget. See the layout code. 
// Declaring these types serves to warn the programmer what's ahead. It also
// provides tsc with the information it needs to prevent certain mistakes.
type BaseDrawingFunction = (ctx : CanvasRenderingContext2D | CTX) => void;
type AugmentedDrawingFunction = BaseDrawingFunction & { figurePanelClass : FigurePanel | null; };


function getAugmentedFunction(fcnName : string ) : AugmentedDrawingFunction {
  
  // This converts from a function name, as specified by the user in their latex
  // document to the internally more useful AugmentedDrawingFunction. Doing this
  // kind of conversion feels icky, but any alternative I've come up with requires
  // that the person using FigPut know more than the absolute minimum about what's
  // behind the curtain.
  //
  // References to these functions come into the program at two points. First, when
  // the document is loaded, a list of the relevant drawing functions is provided
  // by latex. Second, when the user creates widgets within his drawings, these 
  // widgets must belong to a particular drawing and the function (or its name, as
  // a string) is used as the key under which the widget is filed.
  
  // BUG: This double-cast and use of 'any' is horrible, but is there
  // anything better?
  return <AugmentedDrawingFunction> <unknown> window[ fcnName as any ];
}


// Data related to the document pages and figures. Each page
// has one of these in PDFDocument.pageSpecs. This is all
// static data once the document has been loaded.

// BUG: Should this be a type? An interface?

class PageData {
  
  // Note that pageHeight is the height of a *printed* page. If the page
  // has a figure whose height is different than the deleted height, then
  // the page height, as rendered, will be different than this value.
  // Also, the margins and textWidth are only valid when there is a
  // figure to render since they come from figures.aux.
  // For reference, 8.5 x 11 inch paper is 612 x 792 pts; 
  // A4 paper is 8.27 x 11.69 inch or 595.44 x 841.68 pts.
  // However, it seems that latex sometimes produces slightly different
  // dimensions of what must be A4 paper.
  pageHeight : number = 0;
  pageWidth : number = 0;
  leftMargin : number = 0;
  rightMargin : number = 0;
  textWidth : number = 0;
  
  // These arrays have one entry for each interactive figure on the page.
  // insertPoint is the position, from the top, at which the figure is
  // inserted. deleteHeight is how much of the latex doc is omitted, and
  // above/belowHeight is how much room to leave in the browser window for
  // the figure. name is the name of the function to call to draw the
  // figure, done is whether to generate new tikz
  insertPoint : number[] = [];
  deleteHeight : number[] = [];
  aboveHeight : number[] = [];
  belowHeight : number[] = [];
  name : string[] = [];
  done : boolean[] = [];
  
  // For each figure, there is a corresponding function (that will be
  // augmented with a drawing target). These values make the name values
  // given above conceptually redundant.
  drawFcn : AugmentedDrawingFunction[] = [];
}


// Everything related to the pdf document is here. Its main purpose is 
// to handle off-screen rendering. It's all static since there can only be
// one pdf open at a time. It does include data about how to lay out the 
// figures, but none of the code that does it.
//
// I tried making this a module, but really no advantage over a class,
// and definitely some disadvantages.

class PDFDocument {
  
  // The document, as returned by pdfjsLib.getDocument.
  private static pdf : LoadedPDF;
  
  // Total number of pages in the above document.
  public static numberOfPages = 0;
  
  // This is the scale at which to to render the pages offscreen. Setting
  // this equal to 1 means that each px of the off-screen canvas is 1 pdf
  // point. 
  private static zoom : number = 1;
    
  // Information about the layout, one for each page.
  public static pageSpecs : PageData[] = [];
  
  // The fields below are a temporary buffer of pages rendered offscreen.
  // This speeds up the process so that we aren't re-rendering pages.
  // My original intent was for these arrays to have no more than 
  // pageBufSize entries, but the way async/promise works makes that
  // difficult (impossible?). I want render() to render a given page
  // to an offscreen canvas and store that canvas here, which means
  // that all these calls to render() share the variables below.
  // Each call to render() is, unavoidably, in a different thread, and
  // that means that they are all trying to manipulate these varaibles
  // in an order that is unpredictable. The only way that I can see to
  // make this happen in a predicatable way is for each page to have
  // its own canvas. It's OK for render() to put things into its designated
  // spot in an array, but it can't touch anything that some other invocation
  // of render might touch.
  //
  // This is wasteful, but I see no other way to do it without using
  // a mutex. It's not that bad since we're talking about a few bytes for 
  // every page, but still annoying.
  //
  // Aside: JS does have the Atomics object, as of ECMA 2017, and it 
  // might (?) be possible to use that somehow as a way to synchronize
  // threads, but I'd rather not mess with it.
  
  
  // The total number of pages that may be held. This needs to be at least 
  // as large as the number of pages that may be visible at one time if you
  // zoom all the way out, plus a couple extra due to possible problems
  // resulting from race conditions that I can't (?) avoid.
  private static pageBufSize : number = 6;
  
  // This holds a copy of page to be copied to the screen. Every page has 
  // its own entry, although all but (at most) pageBufSize will be null.
  private static theCanvases : (HTMLCanvasElement | null)[] = [];
  
  // The renderCount is how many times we've rendered any page. It's used like
  // a time since I have no confidence in window.performance.now, which is
  // supposed to return the current time in nanoseconds. Every time a page
  // is asked to be rendered, this value increments, and is stored in
  // pageAge[i], where i is the index of the page rendered. It may not 
  // actually be rendered if it would be a re-render, but the time is updated.
  // We need this to flush older pages from the buffer when there are too many.
  // 
  // NOTE: This variable is shared by the various invocations of render()
  // and something like
  // ++renderCount
  // is not an atomic operation. The way I am using this, the fact that
  // the value of renderCount may be incorrect isn't a disaster. It can
  // only be wrong by a few steps. This is why pageBufSize is bumped up to be a
  // little larger than strictly necessary. Worst case, things are re-rendered 
  // and you waste some CPU.
  private static renderCount : number = 0;
  
  // One of these for each page, indexed by page number. Holds the value
  // or renderCount at the time when the page was rendered (or re-rendered).
  private static pageAge : number[] = [];
  
  
  public static async setPDF(thePDF : LoadedPDF) {
    
    // Take the newly loaded pdf and note some of it's stats.
    // Once this is loaded, thePDF never needs to be accessed again
    // from outside this class.
    this.pdf = thePDF;
    
    this.numberOfPages = thePDF.numPages;
  
    // It seems that pdfjs counts pages from one, not zero.
    for (let i = 1; i <= this.numberOfPages; i++)
      {
        await thePDF.getPage(i).then(function(page) {
          
          // Note the i-1 here since I want arrays to start at zero.
          PDFDocument.pageSpecs[i-1] = new PageData();
          PDFDocument.pageSpecs[i-1].pageWidth = page.view[2];
          PDFDocument.pageSpecs[i-1].pageHeight = page.view[3];
          
          // Make sure that the shared buffer arrays are all fully allocated.
          PDFDocument.theCanvases[i-1] = null;
          PDFDocument.pageAge[i-1] = 0;
        });
      }
  }
  
  public static isLoaded() : boolean {
    if (this.pdf === null)
      return false;
    else
      return true;
  }
  
  public static getZoom() : number {
    return this.zoom;
  }
  
  public static setZoom(z : number) : void {
    
    this.zoom = z;
    this.flushBuffer();
  }
  
  public static getCanvas(n : number) {
    
    // Return the canvas for page number n (counting from zero). 
    // This assumes that the canvas is available due to a previous
    // call to render(n) -- which must have resolved by the time this
    // method is called.
    
    // BUG: This shouldn't happen, but maybe I should create a fake
    // blank canvas anyway.
    if (this.theCanvases[n] === null)
      console.log("ERROR! Canvas for page missing: " +n);
      
    return this.theCanvases[n];
  }
  
  public static async render(n : number ) {
    
    // Render page n offscreen, where the pages are counted from zero.
    
    // See if the page is already there.
    if (PDFDocument.theCanvases[n] !== null)
      return;
    
    // Note the +1 here since pdf.js counts pages from 1, not zero.
    let thePage = await PDFDocument.pdf.getPage(n + 1);
    
    let newCanvas : HTMLCanvasElement = document.createElement('canvas');
    PDFDocument.theCanvases[n] = newCanvas;
    PDFDocument.pageAge[n] = PDFDocument.renderCount;
    ++PDFDocument.renderCount;
    
    let offctx = newCanvas.getContext('2d');
    let viewport = thePage.getViewport(PDFDocument.zoom);
    
    newCanvas.width = viewport.width;
    newCanvas.height = viewport.height;
    
    await thePage.render({
      canvasContext: offctx,
      viewport: viewport
    });
  }
  
  public static trimBuffer() : void {
    
    // Call this periodically, like after making a series of calls to
    // render(), to remove excess canvases from the buffer arrays.
    // Due to the risk of race conditions -- which I think is minimal --
    // it's best not to call this until reaching a point at which it 
    // doesn't matter if *all* the offscreen canvases are deleted (although
    // that outcome would be inefficient). The unlikely possiblitity of
    // problems due to race conditions is why this is not part of render().
    let ctot = 0;
    for (let i = 0; i < PDFDocument.numberOfPages; i++)
      {
        if (PDFDocument.theCanvases[i] !== null)
          ++ctot;
      }
    
    // Delete excess offscreen canvases.
    while (ctot > PDFDocument.pageBufSize)
      {
        PDFDocument.removeOldestPage();
        --ctot;
      }
  }
  
  private static removeOldestPage() : void {
    
    // Remove the oldest single canvas from this.theCanvases.
    let oldestIndex = -1;
    let oldestAge = this.pageAge[0];
    for (let i = 0; i < this.numberOfPages; i++)
      {
        if (this.theCanvases[i] === null)
          continue;
        
        if (this.pageAge[i] < oldestAge)
          {
            oldestAge= this.pageAge[i];
            oldestIndex = i;
          }
      }
    this.theCanvases[oldestIndex] = null;
  }
  
  public static flushBuffer() : void {
    
    // Removes all offscreen canvases in the buffer. This is needed, e.g.,
    // when resizing so that you don't use a canvas of the wrong scale.
    for (let i = 0; i < this.numberOfPages; i++)
      this.theCanvases[i] = null;
  }
}


// A class for scheduling event handling. 
//
// Everything is static because there is only one of these for all events. 
// It is used to mediate the event loop so that everything happens 
// syncrhonously, even when async functions are involved. It is used for 
// things like scroll and mouse-down events; it is also used for animations, 
// which are created by certain widgets.
//
// The idea is that you call getID() to get your ticket (like at the
// butcher's). Then call await waitMyTurn() until the butcher is ready.
// The 'await' is crucial! Then call allDone() to thank the butcher and 
// leave so that he can take the next customer.
//
// For this to work properly, calls to getID() must be made outside
// of async functions. Otherwise the IDs could get out of order.
//
// BUG: I could use this in a DRY-er way. Define a method called
// getInLine() that takes the function to be invoked. Have getInLine()
// call getID(), waitMyTurn(), run the job, then call allDone().
//
// BUG: It may be that someone who is more expert in JS could use
// Promises somehow to make this scheme unnecessary. OTOH, this may
// be easier to understand and use than something more clever.
class Events {
  
  // A count of events that have come in. Each event gets its own unique
  // ID by calling getID().
  private static count : number = 0;
  
  // The ID number of the event whose handling was most recently completed.
  private static complete : number = -1;
  
  public static getID() {
    let answer = this.count;
    this.count++;
    return answer;
  }
  
  public static async waitMyTurn(id : number) {
    while (id !== Events.complete + 1)
      await sleep(5);
  }
  
  public static allDone(id : number) {
    Events.complete = id;
  }
}


async function doOpenDocument(latexName : string , scrollPos : number ) {
  
  // Called when the body of the page loads (onload).
  // latexName is the base of the name of the pdf. Thus, latexName.pdf
  // is what is to be opened. The scrollPos value is the position on the
  // page. This is provided by doBeforeUnload(), noted by the server, and
  // given back in the course of the reload.
  
  // The "Get TikZ" button is fixed, and it is always on top.
  // PUBLIC FACING: Comment this block of code out when running serving from a 
  // public-facing website. There's no reason to provide this "Get TikZ" button 
  // and the server won't now how to handle the resulting messages.
  
  let fmenu = document.createElement("button");
  fmenu.style.position = "fixed";
  fmenu.style.display = "block";
  fmenu.style.left = "0px";
  fmenu.style.top = "0px";
  fmenu.style.width = "80px";
  fmenu.style.height = "18px";
  fmenu.style.fontSize = "10px";
  fmenu.textContent = "Get TikZ";
  fmenu.style.zIndex = "99";
  fmenu.onclick = doTikzClick;
  document.body.appendChild(fmenu);
  

  let theCanvas = <HTMLCanvasElement> document.getElementById("pdf_renderer")!;
  theCanvas.style.position = "fixed";
  
  // It might happen that the program starts with some level of zoom.
  PDFDocument.setZoom(window.devicePixelRatio);
  
  // So that the canvas exactly fills the window.
  adjustCanvas();
  
  // Mouse events are registered on the canvas rather than the document
  // (as is done for resize and scroll), but I'm not sure there's any 
  // practical difference since the canvas is the whole document.
  // Note that this does *not* listen for onclick events. In a few cases,
  // they might be a more natural choice (like for buttons), but they make
  // things like coloring a "halfway clicked" widget difficult.
  // Note that this does not distinguish between left, right and middle
  // buttons; a click is a click.
  // Also, the mouseup listener is registered on the window, not the canvas,
  // so that we hear about mouse-ups even when they happen outside the
  // browswer window entirely.
  theCanvas.addEventListener("mousedown",doMouseDown);
  theCanvas.addEventListener("mousemove",doMouseMove);
  theCanvas.addEventListener("mouseup",doMouseUp);
  
  // I considered registering listeners for mouseenter/mouseleave, but
  // they're not needed.
  
  /*
  BUG: I have not tested this much on touch devices. Everything
  works fine on some phones, but not on others. It's a hard to imagine
  people trying to use this on a phone, but I should test on things
  like iPads.
  theCanvas.addEventListener("touchstart",doTouchDown);
  theCanvas.addEventListener("touchend",doTouchUp); 
  theCanvas.addEventListener("touchmove",doTouchMove);
  */
 
  // Open the pdf and digest figures.aux.
  await getDocumentData(latexName);
  
  // Create the various Panel objects that make up the document as a whole.
  // This does the "page layout."
  FullPanel.init(PDFDocument.pageSpecs);
  
  // Now that page layout is done, set the range for the scroll bars on 
  // the browswer window.
  adjustScrollBars();
  
  // When reloading, we don't want things to move back to the top of
  // the first page.
  window.scrollTo(0 , scrollPos);
  
  // Render for the very first time.
  fullRender();
}

async function getDocumentData(latexName : string) {
   
  // This opens and digests the data files and the pdf itself. 
  let thePDF : LoadedPDF = await pdfjsLib.getDocument(latexName+ '.pdf');
  await PDFDocument.setPDF(thePDF);
  
  // Open and digest figures.aux.
  let fname = latexName + ".fig.aux";
  
  // fetch() is the new XMLHttpRequest(), which has been deprecated.
  // Thanks to Dan Pratt for pointing that out.
  let fetchPromise = await fetch(fname);
  let allText = await fetchPromise.text();
  await getFigureInfo(allText);
}

async function syncLoad(scriptName : string) {
  
  // Load the script with the given name and append to the DOM, and
  // don't return until the load is complete. So this should typically
  // be called with 'await'.
  // 
  // Thanks to Dan Pratt for this tidy solution. This works because the
  // promise can't resolve (either way) until appendChild() completes
  // because you can't resolve or reject until the code is loaded
  // or fails to load. Note that the 'once' argument means that the function
  // is called once, then flushed. That's exactly what I want so that they
  // don't hang around and consume resources.
  let theCode = document.createElement("script");
  theCode.type = "application/javascript";
  theCode.src = scriptName;

  var p = new Promise((resolve, reject) => {
    theCode.addEventListener("load", resolve, { once: true});
    theCode.addEventListener("error", reject, { once: true});
  });

  document.body.appendChild(theCode);

  await p;
}

async function getFigureInfo(textBody : string) {
  
  // textBody is the complete contents of the .aux file. Parse it and
  // use the data to fill in PDFDocument.PageSpecs.
  let lines = textBody.split('\n');
  
  for (let i = 0; i < lines.length; i++)
    {
      if (lines[i].length < 2)
        // Last line might be blank.
        break;
      
      var parts = lines[i].split(' ');
      
      if (parts[0] === "load")
        {
          // Load a single .js file and move on.
          await syncLoad(parts[1]);
          continue;
        }
      
      var pnum = parseInt(parts[0]);
      var innerMargin = parseFloat(parts[1]);
      var outerMargin = parseFloat(parts[2]);
      var textWidth = parseFloat(parts[3]);
      var vpos = parseFloat(parts[4]);
      var hLatex = parseFloat(parts[5]);
      var hAbove = parseFloat(parts[6]);
      var hBelow = parseFloat(parts[7]);
      var name : string = parts[8];
      
      // Careful: JS weirdness means that Boolean(parts[9]) is ALWAYS true 
      // (unless parts[9] is empty).
      var done : boolean = (parts[9] === 'true');
      var externLoad : boolean = (parts[10] === 'true');
     
      // Page numbers should start at zero (not 1 as reported by latex).
      pnum -= 1;
      
      // Load the JS now, if necessary.
      // NOTE: In earlier versions, up to v23, I looked to either a
      // .js file or an .fjs file. Individual files are now assumed
      // to be .fjs files. This is much simpler.
      if (externLoad === true)
        await syncLoad(name + ".fjs");
      
      // NOTE: This assumes that the relevant function has been loaded,
      // perhaps as an external file from \LoadFigureCode.
      let augFcn : AugmentedDrawingFunction = getAugmentedFunction( name );
      if (typeof augFcn === "undefined")
        alert(name + " not found. Is the function name correct?");
      
      // Note this for the future.
      augFcn.figurePanelClass = null;
      PDFDocument.pageSpecs[pnum].drawFcn.push(augFcn);
      
      // Copy the remaining fields over.
      
      // Adjust the vertical position to be given relative to the top
      // of the page, rather than the bottom.
      vpos = PDFDocument.pageSpecs[pnum].pageHeight - vpos;
      
      // If there are multiple figures on a particular page, then this
      // is redundant, but harmless.
      if (pnum % 2 === 0)
        {
          PDFDocument.pageSpecs[pnum].leftMargin = innerMargin;
          PDFDocument.pageSpecs[pnum].rightMargin = outerMargin;
        }
      else
        {
          PDFDocument.pageSpecs[pnum].leftMargin = outerMargin;
          PDFDocument.pageSpecs[pnum].rightMargin = innerMargin;
        }
      PDFDocument.pageSpecs[pnum].textWidth = textWidth;
      
      // The per-figure data.
      PDFDocument.pageSpecs[pnum].insertPoint.push(vpos);
      PDFDocument.pageSpecs[pnum].deleteHeight.push(hLatex);
      PDFDocument.pageSpecs[pnum].aboveHeight.push(hAbove);
      PDFDocument.pageSpecs[pnum].belowHeight.push(hBelow);
      PDFDocument.pageSpecs[pnum].name.push(name);
      PDFDocument.pageSpecs[pnum].done.push(done);
    }
  
  // Make sure that all the figure names are distinct.
  for (let i = 0; i < PDFDocument.numberOfPages; i++)
    {
      // Loop over each figure on the current page.
      for (let fig = 0; fig < PDFDocument.pageSpecs[i].name.length; fig++)
        {
          let curName = PDFDocument.pageSpecs[i].name[fig];
        
          // See if this name matches a name on any other page/figure.
          // Consider the current page first.
          for (let subfig = fig + 1; subfig < PDFDocument.pageSpecs[i].name.length; subfig++)
            {
              if (curName === PDFDocument.pageSpecs[i].name[subfig])
                {
                  alert("The figure name " +curName+ " is used more than once.");
                  throw new Error();
                }
            }
          
          // Continue with all the remaining pages.
          for (let j = i + 1; j < PDFDocument.numberOfPages; j++)
            {
              for (let subfig = 0; subfig < PDFDocument.pageSpecs[j].name.length; subfig++)
                {
                  if (curName === PDFDocument.pageSpecs[j].name[subfig])
                    {
                      alert("The figure name " +curName+ " is used more than once.");
                      throw new Error();
                    }
                }
            }
        }
    }
}

function adjustScrollBars() : void {
  
  // Based on the page size and document length, adjust the range of the 
  // browswer's scroll bars.
  var body = <HTMLElement> document.getElementById("mainbody");
  
  // I don't see any way to set the range of the scroll bar directly, so
  // I'm fooling the browser to think that it has a body of a certain
  // height, in px, when the body is really no bigger than the visible
  // area of the window. What I want is a height such that, when the scroll
  // bar is at the bottom, the lower edge of the last page is barely visible
  // in the bottom of the window.
  //
  // There was some mental debate about whether it's better to let the
  // bottom of the last page scroll up beyond the bottom of the window, but
  // this is easier to program, and it's probably more natural for most people.
  let totHeight = FullPanel.totalHeight();
  let visHeight = document.documentElement.clientHeight;
  body.style.height = totHeight + "px";
  
  // The horizontal scroll bar is expressed in terms of pdf pts. This is
  // simpler than above since I don't want to be able to scroll so that the 
  // right edge of the document is barely off the window; I want to be able 
  // to scroll just far enough so that the right edge of the document meets 
  // the right edge of the window. The size of the window becomes irrelevant
  // (i.e., the browser deals with it).
  // However, we do need to know whether a scroll bar is needed at all, 
  // so we can't totally ignore the visible width.
  let visWidth = document.documentElement.clientWidth;
  let totWidth = FullPanel.getFullWidth();
  
  if (visWidth > totWidth)
    {
      // No need for horizontal scroll. It seems like "0px" works, but "0 px"
      // does not. Maybe the space causes a (silent) parse error?
      body.style.width = "0px";
      return;
    }
    
  body.style.width = totWidth + "px";
}

function ctxTopLevelAdjust( ) : CanvasRenderingContext2D {

  // Each function should call this before doing any drawing.
  // Rendering is done relative to the ctx (obviously) with the t-matrix
  // adjusted accordingly. This brings the t-matrix from being the 
  // identity to being relative to the entire document.
  //
  // In earlier versions, the ctx was being passed around and adjusted
  // as the layout manager descended to a particular portion of the document.
  // In some ways that is the cleaner and more modular way to do things,
  // but it can be confusing because the adjustments to the t-matrix aren't
  // done in a central place.
  var canvas = <HTMLCanvasElement> document.getElementById("pdf_renderer");
  let ctx : CanvasRenderingContext2D = canvas.getContext('2d') ! ;

  ctx.resetTransform(); 

  // Center the document. Rather than mess with CSS to center the canvas, 
  // leave the canvas at the size of the entire window, and shift the origin 
  // so the document is rendered in the center of the canvas.
  //
  // However, if the window is smaller than the document, then we do
  // NOT want to center the document. If we did center it, then it would
  // be impossible to scroll over to the left since we can't have "negative
  // scroll;" window.scrollX is always non-negative (unfortunately).
  let visWidth = document.documentElement.clientWidth;
  let totWidth = FullPanel.getFullWidth();
  let z = PDFDocument.getZoom();
  if (visWidth > totWidth)
    {
      // No horizontal scroll bar. Center it.
      let canvasCenter = canvas.width / 2;
      let docCenter = FullPanel.getFullWidth() / 2;
      docCenter *= PDFDocument.getZoom();
      
      ctx.translate(canvasCenter - docCenter,0);
    }
  else
    { 
      // Shift according to the horizontal scroll bar, leaving the document
      // against the left edge. Note the scaling by the zoom factor so
      // as to be consistent with the above.
      ctx.translate(-window.scrollX * PDFDocument.getZoom(),0);
    }

  return ctx;
}

async function fullRender() {

  // Render all the pages of the pdf, together with the figures.
  var canvas = <HTMLCanvasElement> document.getElementById("pdf_renderer");
  
  // This shouldn't be necessary, but do it as a fail-safe.
  var ctx = <CanvasRenderingContext2D> canvas.getContext('2d');
  ctx.resetTransform();
  
  let visWidth = document.documentElement.clientWidth;
  
  let z = PDFDocument.getZoom();
  
  // BUG: Could lead to flicker? It is necessary to clear everything
  // because widgets could be drawn outside the page. I suppose that I could
  // only erase the area outside the pages, which would reduce any flicker.
  // I really don't want to double-buffer everything if it can be avoided.
  // It may be the only solution. The problem is that, if a widget extends 
  // outside the page, and is animated (like LoopAnimWidget) so that it's
  // drawn as part of an animation, then you must erase the entire page to
  // avoid "leftovers," and *that* requires that you redraw the entire 
  // document (or what is visible) with every frame of an animation.
  //
  // BUG: So the correct solution is double-buffering everything, but I don't 
  // feel that it's pressing. For now, either restrict any widgets to 
  // draw within a page or accept that it might leave spoogey leftovers.
  ctx.clearRect(0,0,visWidth*z,document.documentElement.clientHeight*z);

  await FullPanel.renderAll(canvas.height);
}

function adjustCanvas() : void {
  
  // Call when the window has been zoomed or re-sized.
  // 
  // canvas has two different dimensions: canvas.style.width and height, and 
  // canvas.width and height. The style values determine the size of the canvas 
  // on the screen -- so-called ""CSS styling." The straight values (no style)
  // are the number of px in the canvas. By keeping the style values constant and
  // varying the straight values, you can have more or less resolution for the
  // canvas, EVEN WHEN ZOOMED IN.
  //
  // The bottom line is that if we adjust the straight pixel sizes, then
  // we can always have one px for every physical pixel -- up to the accuracy
  // of window.devicePixelRatio.
  //
  // BUG: Check for things with super high pixel density, like phones. I
  // think the devicePixelRatio is somehow wrong for those. It may not matter.
  var canvas = <HTMLCanvasElement> document.getElementById("pdf_renderer") ;
  
  // Adjust the visible width to match the window size. 
  //
  // NOTE: For debugging, it can be helpful to subtract off a bit from these
  // values, like 1, 10 or 50, depending. In earlier versions, there was
  // also a bit of CSS in the html that put a visible rectangle around the canvas.
  //canvas.style.width = (document.documentElement.clientWidth - 50) + "px";
  //canvas.style.height = (document.documentElement.clientHeight - 50) + "px";
  canvas.style.width = document.documentElement.clientWidth + "px";
  canvas.style.height = document.documentElement.clientHeight + "px";
  
  // The visible width of the canvas has just been fixed. Now change the
  // number of px so that the number of px per inch on the screen varies with
  // the level of browser zoom. There seems to be no means of direct access 
  // to the phyical pixels of the monitor, but this is close, and may be 
  // exactly equivalent in many situations.
  canvas.width = document.documentElement.clientWidth * window.devicePixelRatio;
  canvas.height = document.documentElement.clientHeight * window.devicePixelRatio;
}

async function doScrollGuts(id : number) {
  
  // Wait for any active event handler to finish and then wait until it is
  // the turn of current id to run.
  await Events.waitMyTurn(id);
  
  await fullRender();
  
  // Give your ticket to the butcher so that he can take the next customer.
  Events.allDone(id);
}

function doScroll() : void {
  
  // Scroll events are registered below to call this function.
  // It redraws the contents of the main canvas.
  
  // This appears to be called when the page is opened, before almost
  // anything else, so return until page initialization is complete.
  if (PDFDocument.isLoaded() == false)
    return;
    
  // Get a unique ID for this event.
  // This must be done outside any async function to ensure proper order.
  let id = Events.getID();
  
  doScrollGuts(id);
}

async function doResizeGuts(id : number) {
  
  // As with scrolling, wait for any earlier event handler to complete.
  await Events.waitMyTurn(id);
  
  // None of the buffered offscreen canvases are valid anymore.
  // In theory, I could test for whether this was merely a window
  // resize and not a zoom, but it's not worth fooling with.
  PDFDocument.flushBuffer();
   
  console.log("ratio: " + window.devicePixelRatio);
  
  // The other thing that needs to be adjusted is the zoom level
  // used when rendering the pdfs. 
  adjustCanvas();
  
  // Here is the magic. Effectively, this value is now the level of zoom.
  // If you take out this line, and leave PDFDocument.zoom always equal to
  // default value of 1, then zooming does nothing, although the mismatch
  // between the resolution of the off-screen canvas and the resolution on
  // the screen can make things blurry or blocky.
  PDFDocument.setZoom(window.devicePixelRatio);
  
  // If the size of the window changed, then this needs to be adjusted too.
  // This must be done after adjustCanvas().
  adjustScrollBars();
  
  // Render the pages too.
  await fullRender();
  
  // Final bit of scheduling magic.
  Events.allDone(id);
}

function doResize() : void {
  
  // This is called whenever the user zooms and also if the
  // entire broswer window is resized.
  let id = Events.getID();
  doResizeGuts(id); 
}

async function mouseDownGuts(id : number , x : number , y : number ) {
  
  // (x,y) is the location of the mouse click, in pdf points, but
  // relative to the window.
  await Events.waitMyTurn(id);
  
  // Just as we have to tweak the t-matrix to determine where to draw things, 
  // we need to do something similar to figure out where (x,y) is on the page.
  // The difference is that the ctx.translate() operations become adjustments 
  // to x and y.
  let visWidth = document.documentElement.clientWidth;
  let totWidth = FullPanel.getFullWidth();
  let canvas = <HTMLCanvasElement> document.getElementById("pdf_renderer");
  
  if (visWidth > totWidth)
    {
      // No horizontal scroll bar. The document is centered.
      let canvasCenter = canvas.width / 2;
      let docCenter = FullPanel.getFullWidth() / 2;
      canvasCenter = canvasCenter / PDFDocument.getZoom();
      
      x = x - (canvasCenter - docCenter);
    }
  else
    { 
      // Shift according to the horizontal scroll bar.
      x = x + window.scrollX;
    }
  
  // Fix up the y-coordinate too.
  y = y + window.scrollY;
  
  FullPanel.mouseDown(x,y);
  
  // Don't forget!
  Events.allDone(id);
}

function doMouseDown(e : MouseEvent) : void {
  
  // This is an event like any other, so the usual scheduling rigmarole.
  let id = Events.getID();
  mouseDownGuts(id,e.x,e.y);
}

async function mouseMoveGuts(id : number , x : number , y : number ) {
  
  // As above.
  // BUG: Common code. Not DRY.
  await Events.waitMyTurn(id);
  
  // As for mouse-down.
  let visWidth = document.documentElement.clientWidth;
  let totWidth = FullPanel.getFullWidth();
  let canvas = <HTMLCanvasElement> document.getElementById("pdf_renderer");
  
  if (visWidth > totWidth)
    {
      // No horizontal scroll bar. The document is centered.
      let canvasCenter = canvas.width / 2;
      let docCenter = FullPanel.getFullWidth() / 2;
      canvasCenter = canvasCenter / PDFDocument.getZoom();
      
      x = x - (canvasCenter - docCenter);
    }
  else
    { 
      // Shift according to the horizontal scroll bar.
      x = x + window.scrollX;
    }
  
  // Fix up the y-coordinate too.
  y = y + window.scrollY;
  FullPanel.mouseMove(x,y);
  
  // Don't forget!
  Events.allDone(id);
}

function doMouseMove(e : MouseEvent) :void {
  
  // As above.
  let id = Events.getID();
  mouseMoveGuts(id,e.x,e.y);
}

async function mouseUpGuts(id : number , x : number , y : number ) {
  
  // As above.
  // BUG: Common code. Not DRY.
  await Events.waitMyTurn(id);
  
  let visWidth = document.documentElement.clientWidth;
  let totWidth = FullPanel.getFullWidth();
  let canvas = <HTMLCanvasElement> document.getElementById("pdf_renderer");
  
  if (visWidth > totWidth)
    {
      // No horizontal scroll bar. The document is centered.
      let canvasCenter = canvas.width / 2;
      let docCenter = FullPanel.getFullWidth() / 2;
      canvasCenter = canvasCenter / PDFDocument.getZoom();
      
      x = x - (canvasCenter - docCenter);
    }
  else
    { 
      // Shift according to the horizontal scroll bar.
      x = x + window.scrollX;
    }
  
  // Fix up the y-coordinate too.
  y = y + window.scrollY;
  FullPanel.mouseUp(x,y);
  
  // Don't forget!
  Events.allDone(id);
}

function doMouseUp(e : MouseEvent ) : void {
  
  // As above. 
  let id = Events.getID();
  mouseUpGuts(id,e.x,e.y);
}

function doTikzClick() : void {
  
  // Tikz button was clicked. Generate output file(s).
  // 
  // Cycle over every figure and let it generate tikz data.
  for (let pi = 0; pi < PDFDocument.pageSpecs.length; pi++)
    {
      let pd = PDFDocument.pageSpecs[pi] !;
      if (pd.name.length === 0)
        // No figures on this page.
        continue;
      
      for (let fi = 0; fi < pd.name.length; fi++)
        { 
          if (pd.done[fi] == true)
            // User said to skip this one.
            continue;
          
          let theFcn : AugmentedDrawingFunction = pd.drawFcn[fi];
          
          if (theFcn.figurePanelClass === null)
            // Hasn't been loaded, because was never visible.
            continue;
          
          let ctx = new CTX(pd.name[fi]);
          theFcn(ctx);
          ctx.close();
        }
    }
}


function doBeforeUnload(e : Event) {
  
  // This is *very* non-standard. Pass a made-up WHERE message with the position
  // on the document.
  // BUG: This only informs the server of the vertical scroll position.
  // Dealing with horizontal scroll would be more painful. See fullRender()
  // and adjustScrollBars().
  // If *everything* were double-buffered, then this would be a bit easier.
  let req = new XMLHttpRequest();
  
  // We don't care about the second argument. In a POST this would be
  // something like a file name. The third argument, 'false', forces the request
  // to be handled synchronously. If it's done async, then the unload proceeds
  // and completes before this task finishes.
  req.open("WHERE","bogus", false );
    
  req.setRequestHeader("Content-Type","text/plain;charset=UTF-8");
  
  // Send the postion as the message. It could probaby be sent instead of
  // 'bogus' above, and this could be blank.
  let msg = window.scrollY.toString();
  
  // BUG: Firefox generates "Uncaught DOMException: A network error occurred."
  // on this. It might be that XMLHttpRequest is deprecated?
  req.send(msg);
}

// Register additional event handlers. The main (and only) canvas had 
// listeners registered for mouse events in doOpenDocument().
document.addEventListener('scroll',doScroll);
window.addEventListener('resize', doResize);

// PUBLIC FACING: Comment this out. It's doing something *very* non-standard,
// and any normal web-server will choke on it.
window.addEventListener('beforeunload',doBeforeUnload);

