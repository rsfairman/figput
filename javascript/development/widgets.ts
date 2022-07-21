/*
Widget management code.

Typically, widget management is done with a tightly siloed hierarchy, with
widgets in containers, which are in containers, etc. There is a hierarchy 
like that here (though rather flat since I don't need much), but there's also 
a global registry of widgets alongside the hierarchy. This makes widgets 
easier to work with for the author of the latex document.

I've also avoided any kind of clever abstraction around the widget concept.
This can mean that there's a certain amount of boilerplate (not DRY), but
it also means that things aren't tangled up. Widgets can be individually
modified without worries about side-effects.

All widgets use a register() method rather than a constructor. This
is because the user should be able to specify a widget repeatedly
without actually creating a new one every time it's specified. 

So, the user should say something like
let w = RandomWidgetType.register(arguments);
to create a widget from the drawing code. If register() has never been
called for the particular widget, then a new widget *is* created and
a reference to it is placed in global storage. If this widget was created
earlier, then the reference to it is taken from global storage and returned.
So, register() is something like an object factory, but it won't make the 
same object more than once.

Every widget is distinguished by its type and the (name of the) figure it 
belongs to. In addition, if a figure has several widgets of the same type,
then the user must provide an optional name for that particular widget. For
example, if there are three ButtonWidgets for a given figure, then they
might be created by
let b1 = ButtonWidget.register(whatever,"first");
let b2 = ButtonWidget.register(whatever,"second");
let b3 = ButtonWidget.register(whatever,"third"); 

-------------------------

One of the ticklish issues is how to associate widgets with their
figures. In most languages, this problem is solved by explicitly using
"this" somehow. In Java, you might say something like
new Widget(this);
to indicate that the owner of the widget is the class from which the widget 
was constructed. I would rather not do that because it's the kind of 
boilerplate arcana that the user shouldn't have to think about.

JS provides a couple of ways to determine who made a call to a particular
function. The easiest way is like this

function example() {
  let caller = example.caller.name;
  console.log(caller);
} 

This should print the name of the function that invoked example().

Another way is very easy to do, but it's been deprecated. See 
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/caller
Even though it is deprecated, every browser supports it, according to the
above link. Also, my guess is that this is very commonly used since
it's so handy. They won't be getting rid of it any time soon.

If they do get rid of caller.name, then another way to obtain this
information is by creating a bogus Error and examining the call stack:

function example() {
  
  let stack = new Error().stack;
  let caller = stack.split('\n')[1].trim();
  
  // caller is now inforamtion about the function calling this one,
  // including the file name and a bunch of other stuff I don't care about.
  // I just want to know the name of the function.
  // It *appears* (but not extensively tested) that the function name
  // occurs before the first '@'.;
  let callingFcn = caller.split('@')[0];
  console.log(callingFcn);
}

I wanted to use caller.name, even though it is deprecated, because it is
so much easier. Unfortunately, it is not allowed in strict mode.
Since everything that appears within a class is strict, that makes its use
awkward. I tried to get around this by defining a top-level function (outside
any class) that does nothing but return the value I want, but that doesn't
work either. It seems like, as soon as you enter a class, the data you want
is stripped off (or something). Also, now that I've moved to TypeScript any
violation of "strict" is even harder. Since I'll have to define a seperate class
anyway, go ahead and use the Error-based approach.

To top it off, the method via generating an Error is sensitive to the
broswer because different browsers format this information differently.

-------------------

BUG: Future Widgets...?

Because LoopWidget takes such a crazy number of options, it would be nice
to have several widgets that merely call LoopWidget. This wouldn't really
be any different, but would simplify things for the user. Basically, these
would have a reduced set of arguments to register() and just hand everything
off to LoopWidget. They would be a mere glue skeleton. Same goes for 
OpenAnimWidget.

Image Building Widget
  For something like (say) a Mandelbrot set. This takes time to generate
  and you might want to draw it in an open-ended way. It's not reasonable
  to allow the user to move through time and see the state of the image
  at different time steps. The widget should store an off-screen image
  and making the animation "run faster" would mean calling it more frequently
  so that it can do more calculation. So it would use some of the same
  animation infrastructure, but in a different way. The most that makes
  sense here is a pause/run (to reduce computational load) and something
  to increase or decrease the load. This would often be something for which
  it does not make sense to generate tikz. Any JS rendering of a mandelbrot
  set (say) would be terrible for inclusion in a book. You'd generate a
  printed figure like that in some other way, even if an on-line animation
  would be instructive. 

Various restrictions on how a DraggableDot can be moved would be handy.
Restricting to a particular line or arc wouldn't be hard, but restricting to
fall on a given Path2D would be hard. The JS implementation of Path2D is 
poor, and I would need to reimplement the entire thing from the 
ground up. I might need to do some of that anyway for the best tikz output 
(I did some stuff along those lines already).

Draggable Line
  Similar to Draggable dot. In fact, it's not clear that this needs its own
  widget. A line is determined by two points, so the user could use a
  draggable dot and just draw the line himself. The only advantage I can
  see to a draggable *line* is that the user could mouse-down on any
  portion of the line. In fact, that could be done with DraggableDot since
  the "dot" could be an entire line.

Scroll bar for number selection.
  Similar to a spinner, but the user drags a dot along a line.
  Not clear whether a numerical value should appear.
  
Checkboxes and Radio buttons
  Gack
  
Drop-down menu
  Stuff like this gets more fiddly. If you have a drop-down menu and
  it has a vertical scroll bar for multiple selections, then it's even worse.

*/


// There is only one of these, so everything is static. It manages all
// the widgets in the program. 

class WidgetManager {
  
  // All the widgets known to the program.
  // Each of these is an instance of the Widget class.
  // BUG: I could get rid of this and just use theWidgets. It's redundant,
  // and theWidgets is actually easier.
  // BUG: Yes, get rid of this.
  static theList : Widget[] = [];
  
  // Also a complete list of all widgets, but indexed by the figure
  // to which the widget belongs. This makes it easier to pass events
  // to the proper recipent. So this is a hash map taking a figure name
  // (as a string) to an array of Widget objects.
  static theWidgets : Map<AugmentedDrawingFunction,Widget[]> = new Map();
  
  // This is BOGUS. Certain path operations require a CanvasRenderingContext2D, 
  // even when the question is one of pure abstract geometry, like 
  // isPointInPath(), and the only way to get one of these is from a canvas. 
  // Using the visible canvas and ctx for this is prone to all kinds of misuse
  // and mistakes, so create a bogus ctx here.
  // BUG: The long-term solution is not to rely on js for this at all. Write
  // my own code for Bezier curves and the like. I'm partway there already.
  static bogusCanvas : HTMLCanvasElement = document.createElement('canvas');
  static bogusCtx : CanvasRenderingContext2D = WidgetManager.bogusCanvas.getContext('2d') !;
  
  // Whether a widget "owns" a recent mouse-down event. This is needed
  // for things like dragging. If this is null, then the next mouse-down
  // is up for grabs. Otherwise, it points to the relevant Widget object.
  static mouseOwner : Widget | null = null;
  
  // This isn't being used yet, but it will be needed to handle keyboard
  // events. The idea is that a widget ""takes ownership" of a mouse-down
  // with mouseOwner, and that widget is the same one that has focus for
  // any future keyboard events too. The only real difference is that
  // focusOwner is "stickier." This goes to null whenever a user clicks
  // on something other than a widget.
  static focusOwner = null;
  
  
  static register(w : Widget) : void {
    
    this.theList.push(w);
    
    if ( WidgetManager.theWidgets.has(w.betterOwner) )
      WidgetManager.theWidgets.get(w.betterOwner) ! .push(w);
    else
      WidgetManager.theWidgets.set(w.betterOwner,[w]);
  }
  
  static knownWidget(o : string , t : string , n : string) : Widget | null {
    
    // If there is a widget with the given owner (o), type (t) and name(n)
    // in theList, then return it; return null otherwise.
    // BUG: Using a string as owner feels particularly bad.
    for (let i = 0; i < this.theList.length; i++)
      {
        let curW = this.theList[i];
        
        if (o !== curW.owner)
          continue;
        if (t !== curW.type)
          continue;
        if (n === curW.name)
          return curW;
      }
    
    return null;
  }
  
  static mouseDown(theFig : AugmentedDrawingFunction , x : number , y : number ) : void {
    
    // theFig should match one of the Widget object's owner fields.
    // (x,y) is given relative to he origin of the figure.
    if (WidgetManager.theWidgets.has(theFig) === false)
      return;
    
    // The only thing to do here is to pass the event to each widget and
    // see if it wants it. I suppose that I *could* store the area for
    // each widget, and do an initial test here, but this is easier. 
    let wlist : Widget[] = WidgetManager.theWidgets.get(theFig) !;
    
    for (let i = 0; i < wlist.length; i++)
      {
        if (wlist[i].mouseDown(x,y) === true)
          // First come, first serve.
          return;
      }
  }
  
  static mouseMove(theFig : AugmentedDrawingFunction , x : number , y : number ) : void {
    
    // As above.
    if (WidgetManager.mouseOwner === null)
      return;
    
    if (WidgetManager.theWidgets.has(theFig) === false)
      return;
    
    // We only accept mouse moves if the mouse is on the figure that
    // "owns" the mouse event.
    if (WidgetManager.mouseOwner.betterOwner !== theFig)
      return;
    
    WidgetManager.mouseOwner.mouseMove(x,y);
  }
  
  static mouseUp(theFig : AugmentedDrawingFunction , x : number , y : number ) : void {
    
    // As above.
    if (WidgetManager.mouseOwner === null)
      return;
    
    if (WidgetManager.theWidgets.has(theFig) === false)
      return;
    
    if (WidgetManager.mouseOwner.betterOwner !== theFig)
      // Mouse was released over *a* figure, but not the figure with
      // the owning widget. Tell the correct widget about the release, using
      // bogus coordinates so that the mouse-up is sure to be off the widget.
      WidgetManager.mouseOwner.mouseUp(10000000000000,10000000000000);
    
    //console.log("up up");
    WidgetManager.mouseOwner.mouseUp(x,y);
  }
}


function getCaller() : string {
  
  // Irritating function to get around strict mode. See the comment at the
  // top of the file. I want the caller of the thing that calls this.
  //
  // BUG: I was never entirely happy with this, and now that it depends
  // on the particular browser, I am even less happy about it. It's a
  // question of the lesser of two evils: this function or requiring
  // the user to provide a boilerplate 'this' or the like.
   
  let stack : string = new Error().stack !;
  
  // The exact format of the information in stack depends on the particular
  // browser. Firefox produces something like this:
  // 
  // getCaller@http://localhost:8000/widgets.js:375:15
  // register@http://localhost:8000/widgets.js:1557:18
  // geartest01@http://localhost:8000/geartest01.js:142:26
  // render@http://localhost:8000/layout.js:628:11
  // renderFrame@http://localhost:8000/widgets.js:538:13
  // etc.
  //
  // While MS Edge/Chrome produces
  // 
  // Error
  //  at getCaller (widgets.js:375:15)
  //  at Function.register (widgets.js:1557:18)
  //  at geartest01 (geartest01.js:142:26)
  //  at FigurePanel.render (layout.js:628:5)
  //  etc.
  //
  // Depending on the Browser, stack needs to be parsed differently.
  // theBrowser was defined in main.js. 
 
  // The digit value (e.g., '2') indicates how many steps back in the the
  // stack to go.
  if (theBrowser === "Firefox")
    {
      let caller = stack.split('\n')[2].trim();
      
      // caller is now information about a function in the call stack,
      // including the file name and a bunch of other stuff I don't care about.
      // I just want to know the name of the function.
      // The function name occurs before the first '@'.
      let callingFcn = caller.split('@')[0];
      return callingFcn;
    }
  else if (theBrowser === "Chrome")
    {
      let caller = stack.split('\n')[3].trim();
      
      // Here, space-deliminting works better.
      let callingFcn = caller.split(' ')[1];
        
      // But this may return something like 'FigurePanel.bezier'; what I want
      // is just 'bezier'.
      if (callingFcn.indexOf('.') > -1) 
        callingFcn = callingFcn.split('.')[1];
      
      return callingFcn;
    }
  else
   {
    console.log("IMPOSSIBLE ERROR DUE TO UNKNOWN BROWSER TYPE!!!");
    return "";
   } 
}



// Base class for all widgets. No code outside this file should
// ever access this class directly. It's not abstract because there
// are certain actions common to every case in the constructor.

class Widget {
  
  // Every widget is owned by a particular figure. The "owner" is
  // the name of the figure function, just as in latex.
  // BUG: Change this to the AugmentedDrawingFunction. Thus, get rid
  // of this and use betterOwner.
  owner : string = "";
  
  betterOwner : AugmentedDrawingFunction;
  
  // JS isn't very good about types, so it's clearer to tag sub-classes with
  // the name of that sub-class rather than mess with typeof or whatever.
  // This should be "LoopWidget" or whatever the name is of the sub-class.
  type : string = "";
  
  // Name to distinguish this widget from all others of the same
  // type that belong to the same figure. So, the triple (owner,type,name)
  // fully distinguishes this Widget from all others.
  //
  // In principle, this variable could have been avoided as a user-provided
  // value and he wouldn't have to come up with an 'extra' name for the widget,
  // but it wouldn't be easy. The WidgetManager (or something) would have to
  // come up with a unique ID and *that* would require that the user invoke
  // something like a "starting to create widgets" and "done creating widgets"
  // commands. Overall, this seems less fussy for him.
  name : string = ""; 
  
  // The (x,y) is where the widget should be drawn relative to the
  // rectangle of the figure. Often, widgetX will be negative to put the
  // widget in the margin of the page.
  // It's tempting to call these fields x and y, but it would
  // be easy to accidentally reuse those names.
  widgetX = 0;
  widgetY = 0;
  
  // To scale the drawing of a widget up or down.
  scale = 1.0;
  
  // Occassionally, it may make sense to hide a widget. This is different 
  // than being non-visible because the widget is off-screen. If the 
  // widget has hide == true, then it is *never* shown. For example, the
  // way animations work, you have to have an animation widget to run the 
  // animation, even if you don't want to see the widget.
  hide : boolean = true;
  
  
  constructor(owner : string , type : string , x : number , y : number , scale : number , 
        hide : boolean , name : string ) {
    
    // Due to the fact that this tracks the owner of the widget, and how
    // it is done, it is IMPORTANT that no sub-class has its own constructor.
    this.owner = owner;
    this.type = type;
    this.widgetX = x;
    this.widgetY = y;
    this.scale = scale;
    this.hide = hide;
    this.name = name;
    this.betterOwner = getAugmentedFunction(owner);
    
    // When a widget is contructed it must be registered in a global list.
    WidgetManager.register(this);
  }
  
  draw(ctx : CanvasRenderingContext2D) : void {
    // Every sub-class must implement this method. 
    console.log("Called Widget.draw()!!!");
  }
  
  // BUG: These methods that are "never" supposed to be called
  // will be called for the widgets based on the DOM, like ButtonWidget.
  // That's fine -- don't panic! I want to get rid of these DOM-based
  // widgets anyway. DOM = cesspool.
  mouseDown(x : number , y : number ) : boolean {
    // Every sub-class must implement this method.
    // Return true iff the widget wants to "take ownership" of this event. 
    console.log("Called Widget.mouseDown()!!! " +this.name);
    return false;
  }
  
  mouseMove(x : number , y : number ) : void {
    // As above, but returns nothing. 
    console.log("Called Widget.mouseMove()!!!");
  }
  
  mouseUp(x : number , y : number ) : void {
    // As above, but returns nothing. 
    console.log("Called Widget.mouseUp()!!!");
  }
}


// Animations require some infrastructure.
// BUG: Maybe this stuff should be in AnimationWidget.

function doAnimation(theWidget : AnimationWidget) : void {
  
  // This is called to render a frame of an animation. It is generated via 
  // the usual event-loop, so we schedule it just as we do for things like
  // mouse-downs and scroll events.
  // theWidget is the one that "runs" the animation, like a LoopWidget.
  let id = Events.getID();
  doAnimationGuts(id,theWidget);
}

async function doAnimationGuts(id : number , theWidget : AnimationWidget ) {
  
  // Scheduling is handled in a way similar to doScroll() in main.ts.
  await Events.waitMyTurn(id);
  
  await renderFrame(theWidget);
  
  // Advance to the next frame.
  theWidget.curStep += theWidget.stepsPerFrame;
  theWidget.advanceFrame();
  
  // Don't forget this or the program is bricked!
  Events.allDone(id);
}

async function renderFrame(theWidget : Widget ) {
  
  // Calls the code to render the relevant figure. It renders the *entire*
  // figure, widget and all.
  //
  // NOTE: This is used for animations, but it is also used to ensure
  // that any change to a widget (and resulting changes to a figure)
  // is shown.
  //
  // BUG: It's tempting to mention this in the user manual since users might
  // find it useful. OTOH, that shouldn't be encouraged, and this is the kind
  // of thing that might change in a later version.
  
  // The "owner" is the function (from the latex document) that created
  // theWidget.
  let myFunc : AugmentedDrawingFunction = getAugmentedFunction( theWidget.owner );
  let fpc : FigurePanel = myFunc.figurePanelClass !;
  
  // This is generally synchronous, but it doesn't hurt anything to tack an 
  // async on here. Maybe somebody will write one that *is* asynchronous.
  await fpc.render();
}

function getFigureRect(theWidget : Widget ) : { w : number , ha : number , hb : number } {

// Returns the width and height of the rectangle of the widget.
// The height is in two parts: the height above the x-axis, and the height
// below the x-axis.
// The units are pdf points, and the width is relative to the left
// margin. So the width matches the usual coordinate system for drawing
// the figure, and this width is equal to the text width, as reported
// by latex. So x in the range [0,width] should be limited to the area
// below the text.
let myFunc : AugmentedDrawingFunction = getAugmentedFunction( theWidget.owner );
let fpc : FigurePanel = myFunc.figurePanelClass ! ;

let answer = { w: fpc.textWidth, ha : fpc.h - fpc.lowerPadding , hb : fpc.lowerPadding };
return answer;
}

// Base class for widgets that run animations. See LoopAnimWidget and
// OpenAnimWidget. There is a fair amount of overlap between the two types
// of animation class, and it is tempting to pull more stuff up to this level for
// DRY reasons, but it seems cleaner and clearer to limit this to what's needed 
// to run the animations with doAnimation() and related functions.

abstract class AnimationWidget extends Widget {
  
  // Animations run as a series of frames, and this is the frame being displayed.
  // This value may be open-ended or it may "loop back" so that animation repeats.
  curStep = 0;
  
  // How much to advance the above with each frame -- an integer. Animations 
  // can be made to run faster by increasing this value, thereby skipping frames.
  stepsPerFrame = 1;
  
  // The process id for the call to setInterval().
  animID = 0;
  
  advanceFrame() : void {
    // This is why the class is abstract. It moves curStep to the next frame,
    // however that should be done for the particular animation.
    console.log("Calling abstract AnimationWidget.advanceFrame()!");
  }
}

// A LoopWidget is to be used when an animiation runs in a repeating loop.
// You must have one of these for an animation to run, even if the widget
// itself is invisible. 

class LoopAnimWidget extends AnimationWidget {
  
  // These are useful to the user to help properly place things.
  // These values are given with scale equal to 1, and are worked
  // out from the actual drawing code.
  // The TopHeight is the amount above the circle that is used for the 
  // time-step controls, and BottomHeight is the amount used for the 
  // faster/slower, pause/run contols. If you don't want the circle at 
  // all, then it's a little awkward to work out placement, but it works.
  // There is some imprecision here due to line thickneses, but very close.
  static Radius = 41.5;
  static TopHeight = 24.5;
  static BottomHeight = 21.0;
  
  // When things are "selected," draw them in this color.
  static sColor = "blue";
  
  // These are as passed to register(). See that method for a description.
  // They really shouldn't be touched outside this class. The boolean values
  // are whether certain elements of the widget are visible (and hence
  // available for interaction).
  steps = 100;
  start = 0;
  timeStep = 20;
  visSteps = true;
  visFastSlow = true;
  visPauseRun = true;
  visCircle = true;
  triGrab = true;
  
  // This stuff is very much private.
  
  // These are stored when the figure is drawn so that mouse events can find 
  // what was clicked more easily. It's simpler than recalculating with 
  // every event.
  pCircle : Path2D | null = null;
  pUpStep : Path2D | null = null;
  pDownStep : Path2D | null = null;
  pFaster : Path2D | null = null;
  pSlower : Path2D | null = null;
  pPauseRun : Path2D | null = null;
  
  // The states of various parts of the widget; e.g., whether the pause
  // or run icon is present, whether a part is "half-way clicked,"" etc.
  // I'm using 'a' for 'active' and 's' for 'selected.'
  // 
  // BUG: If I want to get *really* fancy, then I need another set of
  // flags to indicate that the mouse *was* clicked on something, so it
  // is "selected," but the user moved the mouse away from the item without
  // a mouse-up, so that selected item should be drawn in normal color, not
  // the highlighted color (sColor). If the mouse is moved back over the
  // selected item, then the color can go back to being the selection color.
  aRunning = true;
  sCircle = false;
  sPauseRun = false;
  sFaster = false;
  sSlower = false;
  sUpStep = false;
  sDownStep = false;
  
  
  static register(ctx : CanvasRenderingContext2D , x : number , y : number , scale : number ,
    visWidget : boolean , steps : number , start : number , timeStep : number , 
    visSteps : boolean, visFastSlow : boolean , visPauseRun : boolean , visCircle : boolean , 
    triGrab : boolean , name : string ) : LoopAnimWidget {
    
    // BUG: Add an argument for the size of the steps so that
    // curStep can be incremented by more than 1?
    
    // This is used something like a constructor. It either creates a new
    // LoopWidget and returns it, or returns one that was created earlier. 
    
    // Many of these arguments are the same as for Widget.constructor().
    // In addition, we have
    // * ctx is assumed to have a t-matrix prepared to properly draw
    //   the widget. 
    // * steps is the number of steps required to form a loop -- when it 
    //   "rolls over" or the "steps per revolution."
    // * start is the starting step, which will usually be zero. 
    // * timeStep, in milliseconds, is the time from frame to frame.
    //   It seems like anything less than about 10ms is pointless.
    //   My guess (?) is that the rate of event generation is throttled
    //   somehow. It could be that my various layers of management are
    //   slowing things down, but I don't think so. 10ms is an eternity
    //   on modern hardware. The eye can only follow about 20 frames per
    //   second, at most, or 50ms per frame, so this is no big deal.
    // * visWidget is whether the widget is visible at all -- same as the
    //   vis argument to Widget.construtor().
    // * visSteps is whether the time step controls (at the top) are visible.
    // * visFastSlow is whether the faster/slower controls are visible (at
    //   the bottom)
    // * visPauseRun is whether the pause/run controls are visible
    // * visCircle is for the circle (with triangular indicator).
    // * triGrab is whether the user is allowed to grab the indicator
    //   triangle and control the animation by dragging it. The indicator
    //   triangle is always there, but it might not be grabable.
    //   Note that if visCircle == false, then triGrab is implicitly false
    //   since the triangle isn't visible either.
    // * name is as in Widget.constructor()
    //
    // There appears to be a tacit assumption that time is measured in
    // integer steps, but fractional values are fine. So they aren't really
    // time "steps," but more like time increments.
    // 
    // BUG: Maybe I should have different classes for some of these choices.
    // There are just too many. These could all use (internally) the
    // same class, just not with such a crazy number of options.
    
    // Instead of messing with LoopWidget.name or something, be explicit.
    let type = "LoopWidget";
    
    // Something like this line must appear with every regester() method
    // for each widget.
    let caller : string = getCaller();
    
    // I am forcing the type here, but if the wrong type is returned,
    // then there are bigger problems.
    let w : LoopAnimWidget = <LoopAnimWidget> WidgetManager.knownWidget(caller,type,name);
    
    if (w != null)
      {
        // Widget is known, but it needs to be drawn too.
        w.draw(ctx);
        return w;
      }
    
    // Got here, so this widget is not already known, and must be created.
    // This class has NO construtor, by design, so this falls through to the
    // super-class Widget constructor.
    // Careful: Internally, I use an "is hidden" flag, but the user passes in
    // an "is visible" flag.
    // BUG: Change the names to be consistent.
    w = new LoopAnimWidget(caller,type,x,y,scale,!visWidget,name);
    
    // Now the additional stuff. This is what would be in a constructor
    // if this class had one.
    w.steps = steps;
    w.start = start;
    w.timeStep = timeStep;
    w.visSteps = visSteps;
    w.visFastSlow = visFastSlow;
    w.visPauseRun = visPauseRun;
    w.visCircle = visCircle;
    w.triGrab = triGrab;
    
    w.curStep = w.start;
    
    // Note the existence of this widget for the future.
    WidgetManager.register(w);
    
    // This is a special case because it's an animiation. The animation
    // needs to be scheduled. It may make sense not to call setInterval()
    // immediately; rather, it may be better to call setTimeout() so that
    // setInterval() is called after a brief pause. It depends on how these
    // two work. Try an immediate call; it *should* be fine.
    w.animID = setInterval(doAnimation,w.timeStep,w);
    
    // Before returning the widget, it must be drawn.
    w.draw(ctx);
    
    return w;
  }
  
  advanceFrame() : void {
    
    // This kind of animation repeats.
    this.curStep += this.stepsPerFrame;
    if (this.curStep >= this.steps)
      this.curStep -= this.steps;
  }
  
  draw(ctx : CanvasRenderingContext2D) : void {
    
    // This is drawn with (0,0) at the center of the circle. The ctx must be
    // shifted and scaled based on where the user wants the widget relative 
    // to the larger drawing area.
    if (this.hide === true)
      return;
    
    // Don't attempt to draw to a tikz file.
    if (ctx instanceof CTX)
      return;
    
    let saveT = ctx.getTransform();
    ctx.translate(this.widgetX,this.widgetY);
    ctx.scale(this.scale,this.scale);
    
    var p = new Path2D();
    
    // These values determine where the entire drawing is. (cx,cy) is the
    // center of the circular thing, with radius r.
    // In unscaled terms, it's clear that cx should equal r to make the
    // widget but up against x = 0. It's messier for the y-coordinate and you
    // need to work backwards from what the values defined below. The total 
    // height is 2r (the circle), plus circWidth (circle line thickness),
    // plus 2 * arrowHeight (the go fast/go slow things). Then we need to
    // add the stuff on the top: upperGap, plus stepHeight, plus stepThick.
    // This is silly and probably confusing to the user. Just place the 
    // widget relative to the center of the circle. In other words, set 
    // (cx,cy) = (0,0). The user just needs adjust accordingly, and
    // exactly what he wants to do will be influenced by whether the upper
    // and lower sub-controls are present. 
    var r = 40;
    var cx = 0;
    var cy = 0;
    var circWidth = 3;
    
    if (this.visCircle == true)
      {
        // Draw the circle. (cx,cy) is center r and r are the two axes of the 
        // elipse. 0 is that the ellipse isn't rotated, and the last two are
        // the start and end angle.
        p.ellipse(cx,cy,r,r,0,0,2*Math.PI);
        
        // Note this circle for reference by mouse events.
        this.pCircle = new Path2D(p);
        
        ctx.lineWidth = circWidth;
        
        if (this.sCircle == true)
          ctx.strokeStyle = LoopAnimWidget.sColor;
        else
          ctx.strokeStyle = "black";
        
        ctx.stroke(p);
        
        ctx.lineWidth = 1;
    
        // A little triangle to point to the location within the animation loop.
        // This value is in radians, in [0,2pi).
        
        // Location of indicator triangle around the perimeter of the circle.
        // Minus so that it travels clock-wise, which seems to be our natural expectation.
        var loc = -2*Math.PI * this.curStep / this.steps;
        
        var triHeight = 10;
        
        // This is half the full angle at the outer point.
        var triAngle = Math.PI/20;
        
        p = new Path2D();
        
        var x = cx + (r-circWidth/2) * Math.cos(loc);
        var y = cy + (r-circWidth/2) * Math.sin(loc);
        p.moveTo(x,y);
        
        x = cx + (r-triHeight) * Math.cos(loc + triAngle);
        y = cy + (r-triHeight) * Math.sin(loc + triAngle);
        p.lineTo(x,y);
        
        x = cx + (r-triHeight) * Math.cos(loc - triAngle);
        y = cy + (r-triHeight) * Math.sin(loc - triAngle);
        p.lineTo(x,y);
        
        p.closePath();
        
        ctx.strokeStyle = "red";
        ctx.stroke(p);
        ctx.strokeStyle = "black";
      }
    
    // Next, some controls at the bottom for going faster/slower and
    // pausing/running.
    // First, a pair of '>' for going faster.
    let arrowOffset = 18;
    let lowerGap = 6;
    let arrowHeight = 7;
    let arrowDepth = 4;
    let arrowPairSpace = 3;
    let arrowThick = 1.25;
    
    if (this.visFastSlow === true)
      {
        ctx.lineWidth = arrowThick;
        
        if (this.sFaster == true)
          ctx.strokeStyle = LoopAnimWidget.sColor;
        else
          ctx.strokeStyle = "black";
          
        p = new Path2D();
        p.moveTo(cx + arrowOffset,cy - r - circWidth/2 - lowerGap);
        p.lineTo(cx + arrowOffset + arrowDepth,
                 cy - r - circWidth/2 - lowerGap - arrowHeight);
        p.lineTo(cx + arrowOffset,
                 cy - r - circWidth/2 - lowerGap - 2*arrowHeight);
        ctx.stroke(p);           
        
        // You can't just shift a path. Needs to be rebuilt.
        // BUG: I need to add that ability to my FPath class.
        // Maybe I have already?
        p = new Path2D();
        p.moveTo(cx + arrowOffset + arrowPairSpace,cy - r - circWidth/2 - lowerGap);
        p.lineTo(cx + arrowOffset + arrowDepth + arrowPairSpace,
                 cy - r - circWidth/2 - lowerGap - arrowHeight);
        p.lineTo(cx + arrowOffset + arrowPairSpace,
                 cy - r - circWidth/2 - lowerGap - 2*arrowHeight);
        ctx.stroke(p);
        
        // A rectangle for the clickable area.
        this.pFaster = new Path2D();
        this.pFaster.rect(cx + arrowOffset - arrowThick,cy - r - circWidth/2 - lowerGap - 2*arrowHeight,
              arrowPairSpace + arrowDepth + 2*arrowThick,2*arrowHeight);
        
        // ctx.strokeStyle = 'green';
        // ctx.stroke(this.pFaster);
              
        // Same idea: '<' to go slower.
        if (this.sSlower == true)
          ctx.strokeStyle = LoopAnimWidget.sColor;
        else
          ctx.strokeStyle = "black";
        
        p = new Path2D();
        p.moveTo(cx - arrowOffset,cy - r - circWidth/2 - lowerGap);
        p.lineTo(cx - arrowOffset - arrowDepth,
                 cy - r - circWidth/2 - lowerGap - arrowHeight);
        p.lineTo(cx - arrowOffset,
                 cy - r - circWidth/2 - lowerGap - 2*arrowHeight);
        ctx.stroke(p);
        
        p = new Path2D();
        p.moveTo(cx - arrowOffset - arrowPairSpace,cy - r - circWidth/2 - lowerGap);
        p.lineTo(cx - arrowOffset - arrowDepth - arrowPairSpace,
                 cy - r - circWidth/2 - lowerGap - arrowHeight);
        p.lineTo(cx - arrowOffset - arrowPairSpace,
                 cy - r - circWidth/2 - lowerGap - 2*arrowHeight);
        ctx.stroke(p);
        
        // And the clickable area.
        this.pSlower = new Path2D();
        this.pSlower.rect(
            cx - arrowOffset - arrowPairSpace - arrowDepth - arrowThick,
            cy - r - circWidth/2 - lowerGap - 2*arrowHeight,
            arrowPairSpace + arrowDepth + 2*arrowThick,2*arrowHeight);
            
        // ctx.strokeStyle = 'green';
        // ctx.stroke(this.pSlower);
      }
    
    ctx.lineWidth = 1;
    
    if (this.visPauseRun === true)
      {
        // A || or triangle for pause or run.
        let pauseSpace = 3.25;
        let pauseThick = 1.5;
        let pauseHeight = 2 * arrowHeight;
        
        let runThick = 1.5;
        let runLeftRight = 5;
        let runHeight = 2 * arrowHeight;
            
        if (this.sPauseRun == true)
          ctx.strokeStyle = LoopAnimWidget.sColor;
        else
          ctx.strokeStyle = "black";
              
        if (this.aRunning === true)
          {
            // The animation is running, so show || to allow pausing.
            ctx.lineWidth = pauseThick;
              
            p = new Path2D();
            p.moveTo(cx + pauseSpace,cy - r - circWidth/2 - lowerGap);
            p.lineTo(cx + pauseSpace,cy - r - circWidth/2 - lowerGap - pauseHeight);
            ctx.stroke(p);
            
            p = new Path2D();
            p.moveTo(cx - pauseSpace,cy - r - circWidth/2 - lowerGap);
            p.lineTo(cx - pauseSpace,cy - r - circWidth/2 - lowerGap - pauseHeight);
            ctx.stroke(p);
            
            ctx.lineWidth = 1;
          }
        else
          {
            // Animation is paused, so show triangle to run it again.
            ctx.lineWidth = runThick;
            
            p = new Path2D();
            p.moveTo(cx - runLeftRight,cy - r - circWidth/2 - lowerGap);
            p.lineTo(cx - runLeftRight,cy - r - circWidth/2 - lowerGap - runHeight);
            p.lineTo(cx + runLeftRight,cy - r - circWidth/2 - lowerGap - runHeight/2);
            p.closePath();
            ctx.stroke(p);
          }
        
        // Either way (paused or running), we need the clickable area.
        // This area is too generous for the "run" triangle, because
        // I use the same rectangle for "pause" and "run," but no big deal.
        this.pPauseRun = new Path2D();
        this.pPauseRun.rect(cx - runLeftRight - runThick,
          cy - r - circWidth/2 - lowerGap - runHeight - runThick,
            2*runLeftRight + 2*runThick,runHeight + 2*runThick);
        
        // ctx.strokeStyle = "blue";
        // ctx.lineWidth = 0.5;
        // ctx.stroke(this.pPauseRun);
        // ctx.strokeStyle = "black";
      }
    
    ctx.lineWidth = 1;
    
    // Now some symbols above the circle for adjusting the step size.
    
    if (this.visSteps === true)
      {
        // Up and down arrows.
        let stepSpace = 20;
        let stepThick = 2.0;
        let upperGap = 8;
        let stepHeight = 15;
        let stepArrowHeight = 8;
        let stepArrowWidth = 5;
        
        ctx.lineWidth = stepThick;
        
        if (this.sDownStep == true)
          {
            ctx.strokeStyle = LoopAnimWidget.sColor;
            ctx.fillStyle = LoopAnimWidget.sColor;
          }
        else
          {
            ctx.strokeStyle = "black";
            ctx.fillStyle = "black";
          }
          
        // Vertical line
        p = new Path2D();
        p.moveTo(cx - stepSpace,cy + r + circWidth/2 + upperGap);
        p.lineTo(cx - stepSpace,cy + r + circWidth/2 + upperGap + stepHeight);
        ctx.stroke(p);
        
        // Arrow head
        p = new Path2D();
        p.moveTo(cx - stepSpace,
            cy + r + circWidth/2 + upperGap - stepThick);
        p.lineTo(cx - stepSpace + stepArrowWidth,
            cy + r + circWidth/2 + upperGap + stepArrowHeight - stepThick);
        p.lineTo(cx - stepSpace - stepArrowWidth,
            cy + r + circWidth/2 + upperGap + stepArrowHeight - stepThick);
        p.closePath();
        ctx.fill(p);
        
        // Clickable area for down arrow.
        this.pDownStep = new Path2D();
        this.pDownStep.rect(cx - stepSpace - stepArrowWidth,
            cy + r + circWidth/2 + upperGap - stepThick,
            2*stepArrowWidth,stepHeight + stepThick);
        
        // ctx.strokeStyle = "blue";
        // ctx.lineWidth = 0.5;
        // ctx.stroke(this.pDownStep);
        // ctx.strokeStyle = "black";
        // ctx.lineWidth = stepThick;
        
        // Again, to the right, arrow head up.
        if (this.sUpStep == true)
          {
            ctx.strokeStyle = LoopAnimWidget.sColor;
            ctx.fillStyle = LoopAnimWidget.sColor;
          }
        else
          {
            ctx.strokeStyle = "black";
            ctx.fillStyle = "black";
          }
          
        p = new Path2D();
        p.moveTo(cx + stepSpace,cy + r + circWidth/2 + upperGap);
        p.lineTo(cx + stepSpace,cy + r + circWidth/2 + upperGap + stepHeight);
        ctx.stroke(p);
        
        p = new Path2D();
        p.moveTo(cx + stepSpace,
            cy + r + circWidth/2 + upperGap + stepHeight + stepThick);
        p.lineTo(cx + stepSpace + stepArrowWidth,
            cy + r + circWidth/2 + upperGap + stepHeight - stepArrowHeight + stepThick);
        p.lineTo(cx + stepSpace - stepArrowWidth,
            cy + r + circWidth/2 + upperGap + stepHeight - stepArrowHeight + stepThick);
        p.closePath();
        ctx.fill(p);
        
        // Clickable area for up arrow.
        this.pUpStep = new Path2D();
        this.pUpStep.rect(cx + stepSpace - stepArrowWidth,
            cy + r + circWidth/2 + upperGap,
            2*stepArrowWidth,stepHeight + stepThick);
        
        // ctx.strokeStyle = "blue";
        // ctx.lineWidth = 0.5;
        // ctx.stroke(this.pUpStep);
        // ctx.strokeStyle = "black";
        
        ctx.lineWidth = 1;
        
        // A little step icon.
        ctx.strokeStyle = "black";
        ctx.fillStyle = "black";
        stepThick = 1.5;
        let stepSize = 6;
        
        ctx.lineWidth = stepThick;
        
        // Steps made as one path, starting at upper-left
        p = new Path2D();
        p.moveTo(cx - stepSize,cy + r + circWidth/2 + upperGap + 2*stepSize);
        p.lineTo(cx,cy + r + circWidth/2 + upperGap + 2*stepSize);
        p.lineTo(cx,cy + r + circWidth/2 + upperGap + stepSize);
        p.lineTo(cx + stepSize,cy + r + circWidth/2 + upperGap + stepSize);
        p.lineTo(cx + stepSize,cy + r + circWidth/2 + upperGap);
        ctx.stroke(p);
      }
    
    ctx.lineWidth = 1;
    
    // Used this to verify the constants. The rectangle barely encloses
    // the widget.
    //ctx.strokeRect(
    //  -LoopWidget.Radius,-LoopWidget.Radius - LoopWidget.TopHeight,
    //  2*LoopWidget.Radius,
    //  2*LoopWidget.Radius + LoopWidget.TopHeight + LoopWidget.BottomHeight);
    
    ctx.setTransform(saveT);
  }
  
  mouseDown(x : number , y : number ) : boolean {
    
    // (x,y) is given in coordinates relative to the owning figure.
    // Return true iff these coordinates apply to this widget.
    if (this.hide === true)
      return false;
    
    // Adjust coordinates relative to what the draw() methods uses.
    // This way we can compare (x,y) to what is on the screen.
    x -= this.widgetX;
    y -= this.widgetY;
    x /= this.scale;
    y /= this.scale;
    
    // The widget also has a scale, which must be taken into account.
    WidgetManager.bogusCtx.resetTransform();
    
    // There is isPointInPath() and isPointInStroke().
    // It seems that isPointInPath() works on an abstract geometric basis;
    // the lineWidth of the ctx doesn't matter. OTOH, isPointInStroke()
    // is affected by the lineWidth -- as it must be to work in any
    // reasonable way.
    //
    // Note also that isPointInPath() defaults to the non-zero winding rule.
    // Pass "evenodd" as the final argument for that winding rule.
    
    // Check the pause/run area first since it should be "on top of"
    // the circle area.
    if (this.pPauseRun !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pPauseRun,x,y);
        if (isin === true)
          {
            this.sPauseRun = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
    
    // And the run faster area.
    if (this.pFaster !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pFaster,x,y);
        if (isin === true)
          {
            this.sFaster = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
      
    // The run slower area.
    if (this.pSlower !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pSlower,x,y);
        if (isin === true)
          {
            this.sSlower = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
      
    // The longer step area.
    if (this.pUpStep !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pUpStep,x,y);
        if (isin === true)
          {
            this.sUpStep = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
    
    // The shorter step area.  
    if (this.pDownStep !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pDownStep,x,y);
        if (isin === true)
          {
            this.sDownStep = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
    
    // Last thing to check since it should be "underneath" everything.
    if (this.pCircle !== null)
      { 
        // If the user clicked near the circle, then set the indicator and 
        // current step to that position. Be generous with the clickable area.
        WidgetManager.bogusCtx.lineWidth = 15;
        let isin = WidgetManager.bogusCtx.isPointInStroke(this.pCircle,x,y);
        
        if (isin === true)
          {
            // Act on this click and take ownership for future draggging.
            // Want an angle in [0,2pi].
            this.sCircle = true;
            
            // Again, minus since clockwise.
            let alpha = -Math.atan2(y,x);
            if (alpha < 0)
              alpha += 2*Math.PI;
            
            this.curStep = Math.floor(this.steps * alpha / (2*Math.PI));
            
            WidgetManager.mouseOwner = this;
            
            // The appearance of the widget has changed.
            renderFrame(this);
    
            return true;
          }
      }
      
    return false;
  }
  
  mouseMove(x : number , y : number ) : void {
    
    // As above.
    if (this.hide === true)
      return;
    
    x -= this.widgetX;
    y -= this.widgetY;
    x /= this.scale;
    y /= this.scale;
    WidgetManager.bogusCtx.resetTransform();
    
    if (this.sCircle === true)
      {
        // What I will do it check that the mouse is "close enough" to the 
        // circle, but it can be a *long* ways away.
        WidgetManager.bogusCtx.lineWidth = 40;
        let isin = WidgetManager.bogusCtx.isPointInStroke(this.pCircle !,x,y);
        
        if (isin == false)
          return;
        
        // Minus to make clockwise.
        let alpha = -Math.atan2(y,x);
        if (alpha < 0)
          alpha += 2*Math.PI;
        
        this.curStep = Math.floor(this.steps * alpha / (2*Math.PI));
        
        // The appearance of the widget may have changed.
        renderFrame(this);
      }
    
    // BUG: I might (?) want colors to change based on what the mouse
    // is over. See the BUG comment that goes with aRunning, sCircle, etc.,
    // at the top of the class.
  }
  
  mouseUp(x : number , y : number ) : void {
    
    // As above.
    if (this.hide === true)
      return;
    
    x -= this.widgetX;
    y -= this.widgetY;
    x /= this.scale;
    y /= this.scale;
    WidgetManager.bogusCtx.resetTransform();
    
    // The mouse is up, so nothing can remain selected. In most cases,
    // releasing the mouse over the selected item means that something
    // must be done since the "button" was properly pressed.
    this.sCircle = false;
    
    if (this.sPauseRun)
      {
        // Did they *release* the mouse over the pause/run area?
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pPauseRun ! ,x,y);
        if (isin === true)
          { 
            // Start/stop the animation.
            if (this.aRunning === true)
              // Currently running. Pause it.
              clearInterval(this.animID);
            else
              // Currently paused. Restart it.
              this.animID = setInterval(doAnimation,this.timeStep,this);
            
            // Change the pause/run icon too.
            if (this.aRunning === true)
              this.aRunning = false;
            else
              this.aRunning = true;
          }
          
        this.sPauseRun = false;
      }
    
    if (this.sFaster === true)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pFaster ! ,x,y);
        if (isin === true)
          {
            // Make the animation run a bit faster by reducing the frame-to-
            // frame time step -- the animation speed. This could be done in
            // a lot of different ways, by using a factor of 1.4 seems about
            // right.
            this.timeStep /= 1.4;
            if (this.timeStep < 1)
              this.timeStep = 1;
            
            // Stop the animation and restart it at the new speed,
            // but only if it is currently running. It restarts always, but
            // don't try to halt it if it's not running.
            if (this.aRunning === true)
              clearInterval(this.animID);
            
            this.animID = setInterval(doAnimation,this.timeStep,this);
            this.aRunning = true;
          }
        
        this.sFaster = false;
      }
    
    if (this.sSlower === true)
      {
        // Just as above, but make it go slower.
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pSlower ! ,x,y);
        if (isin === true)
          {
            this.timeStep *= 1.4;
            
            // More than a second per frame is silly.
            if (this.timeStep > 1000)
              this.timeStep = 1000;
            
            if (this.aRunning === true)
              clearInterval(this.animID);
            
            this.animID = setInterval(doAnimation,this.timeStep,this);
            this.aRunning = true;
          }
        
        this.sSlower = false;
      }
    
    if (this.sUpStep === true)
      {
        // Make the number of time increments per frame larger.
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pUpStep ! ,x,y);
        if (isin === true)
          { 
            // Use a smaller ratio here. Conceptually, it seems like
            // this should be an integer, but it really doesn't have to be.
            this.stepsPerFrame *= 1.25;
            
            // Fewer than 3 frames per cycle seems silly. For most animations,
            // you'd proably want at least 10 or 20, at a minimum.
            if (this.stepsPerFrame > this.steps / 3)
              this.stepsPerFrame = this.steps / 3;
          }
        
        this.sUpStep = false;
      }
      
    if (this.sDownStep === true)
      {
        // As above.
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pDownStep ! ,x,y);
        if (isin === true)
          { 
            this.stepsPerFrame /= 1.25;
            
            // I am tempted to put a lower bound on this, but it's 'not
            // absolutely necessary.
          }
        
        this.sDownStep = false;
      }
    
    // The appearance of the widget may have changed.
    renderFrame(this);
    
  }
}


// An OpenAnimWidget is for an open-ended animation that doesn't loop back
// on itself and repeat. In many respects, it's similar to a LoopWidget.
// It looks different because it's a long bar, sort of like a scroll bar.
// It's so similar that there are minimal (for me) comments. See
// LoopWidgets for certain details.

class OpenAnimWidget extends AnimationWidget {
  
  // These are useful to the user to help properly place things.
  // The widget is placed based on the lower-left corner, and the
  // user can specify the width. The BarHeight is the height of the
  // bar portion -- it's essentially the radius of the indicator dot --
  // and ControlsHeight is for the controls.
  static BarHeight = 6.0;
  static ControlsHeight = 20.0;
  
  // This is useful to help the user place stuff above the control.
  static TotalHeight = 32.0;
  
  
  // When things are "selected," draw them in this color.
  static sColor = "blue";
  
  // These things are important to the animation drawing code, and are
  // meant to be public(ish).
  
  // These are as passed to register().
  barLength = 100;
  timeStep = 25;
  decay = 1.0001;
  visSteps = true;
  visFastSlow = true;
  visPauseRun = true;
  visBar = true;
  barGrab = true;
  
  // As for LoopWidth, width modest changes:
  
  // Clickable areas:
  pBar : Path2D | null = null;
  pDot : Path2D | null = null;
  pFaster : Path2D | null = null;
  pSlower : Path2D | null = null;
  pPauseRun : Path2D | null = null;
  pUpStep : Path2D | null = null;
  pDownStep : Path2D | null = null;
  
  // States of parts:
  // 
  // BUG: If I want to get *really* fancy, then I need another set of
  // flags to indicate that the mouse *was* clicked on something, so it
  // is "selected," but the user moved the mouse away from the item without
  // a mouse-up, so that selected item should be drawn in normal color, not
  // the highlighted color (sColor). If the mouse is moved back over the
  // selected item, then the color can go back to being the selection color.
  aRunning = true;
  sDot = false;
  sFaster = false;
  sSlower = false;
  sPauseRun = false;
  sUpStep = false;
  sDownStep = false;
  
  
  static register(ctx : CanvasRenderingContext2D , x : number , y : number ,scale : number ,
    width : number , visWidget : boolean , timeStep : number , decay : number ,
    visSteps : boolean , visFastSlow : boolean , visPauseRun : boolean ,visBar : boolean ,
    barGrab : boolean , name : string ) : OpenAnimWidget {
    
    // This is used something like a constructor. It either creates a new
    // LoopWidget and returns it, or returns one that was created earlier. 
    
    // Many of these arguments are the same as for Widget.constructor().
    // In addition, we have
    // * ctx is assumed to have a t-matrix prepared to properly draw
    //   the widget. 
    // * width is the length of the indicator bar. If you want both the
    //   controls (time steps and fast/slow), then this should be at least
    //   200 so that the controls don't stick out. Of course, this is the
    //   unscaled size, and you can make the entire thing smaller with the
    //   scale argument.
    // * timeStep, in milliseconds, is the time from frame to frame.
    // * decay is complicated. The value of this.curStep must be mapped to 
    //   the linear bar, which is not infinite.
    //   We need a map from [0,infty) to [0,width). Define
    //   f(s) =  1 - 1/a^s
    //   This maps [0,infty) to [0,1), provided that a > 1. Then
    //   g(s) = w f(s)
    //   is the function we want. But what about a? The closer a is to 1,
    //   the faster g(s) will approach w. Typically, you'll want a to be
    //   something like 1.001 or 1.0001, depending on the number of steps
    //   in your animation. The decay argment determines a:
    //   a = 1 + 1/decay, so you'll usually want decay to be somewhere in the
    //   range from 100 to (maybe) 100,000. It depends how big the steps
    //   are and how long you want the animiation to run. For comparison, 
    //   decay = 1,000 puts f(2000) = 0.86 and f(5000) = 0.99, while 
    //   decay =  10,000 puts f(2000) = 0.18, f(5000) = 0.39, 
    //   f(20,000) = 0.86. You can also work backwards. If you want 
    //   f(n) = x, where x is in [0,1), like x = 85%, then you want 
    //   1 / (1 + 1/a)^n = x, or
    //   a = 1 / [ x^(1/n) - 1 ]
    //   That's not so informative, but you can write it as 
    //   a = 1 / [ exp(-ln(x)/n) - 1 ]
    //   If we take x \approx 0.86 so that ln(x) = -0.15 (exactly), then
    //   a = 1 / [ exp(-0.15/n) - 1 ]
    //   Plug in the value for n at which you want to have reached the
    //   86% level, and you get a.
    //   For brevity, in the code, I use this.decay as the value, a,
    //   discussed above. 
    //   BUG: I feel like I made an algebra mistake, but that's the idea.
    // * visWidget is whether the widget is visible at all -- same as the
    //   vis argument to Widget.construtor().
    // * visSteps is whether the time step controls (at the right) are visible.
    // * visFastSlow is whether the faster/slower controls are visible (at
    //   the left)
    // * visPauseRun is whether the pause/run controls are visible.
    // * visBar is for the progress bar (with dot indicator).
    // * barGrab is whether the user is allowed to grab the dot indicator
    //   triangle and control the animation by dragging it.
    // * name is as in Widget.constructor()
    // 
    // BUG: Maybe I should have different classes for some of these choices.
    // There are just too many. These could all use (internally) the
    // same class, just not with such a crazy number of options.
    
    
    // As for LoopWidget.
    let type = "OpenAnimWidget";
    let caller = getCaller();
    
    let w : OpenAnimWidget = <OpenAnimWidget> WidgetManager.knownWidget(caller,type,name);
    
    if (w != null)
      {
        w.draw(ctx);
        return w;
      }
    
    // Got here, so this widget is not already known, and must be created.
    w = new OpenAnimWidget(caller,type,x,y,scale,!visWidget,name);
    
    // Adjust the length for the scale so that if the user asks for
    // a bar that is X px long, he gets it. So, the scale adjusts the size
    // of the "bits", not the total size.
    w.barLength = width / scale;
    w.timeStep = timeStep;
    w.visSteps = visSteps;
    w.visFastSlow = visFastSlow;
    w.visPauseRun = visPauseRun;
    w.visBar = visBar;
    w.barGrab = barGrab;
    
    // For internal use, we convert the given decay to the value we use
    // for exponentiation.
    w.decay = 1 + 1/decay;
    
    // Note the existence of this widget for the future.
    WidgetManager.register(w);
    
    // This is a special case because it's an animiation, as with LoopWidget.
    w.animID = setInterval(doAnimation,w.timeStep,w);
    
    // Before returning the widget, it must be drawn.
    w.draw(ctx);
    
    return w;
  }
  
  advanceFrame() : void {
    
    // This animation is open-ended; curStep grows without limit (up to 
    // E500 or whatever it is).
    this.curStep += this.stepsPerFrame;
  }
  
  draw(ctx : CanvasRenderingContext2D ) : void {
    
    // This is drawn with (0,0) at the lower-right corner.
    if (this.hide === true)
      return;
    
    // Don't draw the widget to a tikz file.
    if (ctx instanceof CTX)
      return;
    
    let saveT = ctx.getTransform();
    ctx.translate(this.widgetX,this.widgetY);
    ctx.scale(this.scale,this.scale);
    
    var p = new Path2D();
    
    if (this.visBar == true)
      {
        // These *could* be made accessible to the user, but we already
        // have a heap of arguments to create this thing.
        let indDotRadius = 5.0;
        let barThick = 3.0;
        let indDotThick = 2.0;
        
        // Draw the indicator bar and dot.
        // Bar first.
        p.moveTo(0,indDotRadius + OpenAnimWidget.ControlsHeight);
        p.lineTo(this.barLength,indDotRadius + OpenAnimWidget.ControlsHeight);
        
        // Note this circle for reference by mouse events.
        if (this.barGrab === true)
          this.pBar = new Path2D(p);
        
        ctx.lineWidth = barThick;
        
        ctx.stroke(p);
        
        // Now the dot.
        p = new Path2D();
        
        let dx = Math.pow(this.decay,this.curStep);
        
        dx = this.barLength * (1 - 1/dx);
        p.ellipse(dx,indDotRadius + OpenAnimWidget.ControlsHeight,
          indDotRadius,indDotRadius,0,0,2*Math.PI);
        
        if (this.barGrab === true)
          this.pDot = new Path2D(p);
        
        if (this.sDot == true)
          ctx.fillStyle = OpenAnimWidget.sColor;
        else
          ctx.fillStyle = "red";
        
        ctx.fill(p);
        
        ctx.lineWidth = indDotThick;
        ctx.strokeStyle = "black";
        ctx.stroke(p);
      }
    
    // There may be controls under the bar for faster/slower, pause/run
    // and larger/smaller steps. Whatever of these is present, they should be
    // centered, which is a pain. The total width of the pause/run controls
    // is 40.5, obtained by checking the size of the box necessary to
    // exactly enclose the controls. Height of that box is 14. I've set
    // things up so that the height of the "step size" controls is also 14,
    // and the width of that part is 32. These *could* be expressed in
    // terms of the various constants defined below, but hard-coding is
    // easier.
    // These controls are drawn relative to their individual centers,
    // so the shifting is done relative to those centers and their widths.
    let pauseRunWidth = 40;
    let stepsWidth = 32;
    let intraGap = 8;
    
    // Here (compared to LoopWidget), I use cx and cy to shift the parts
    // of the control down and right. The right-shift is used for centering
    // Changing the t-matrix of ctx would work too.
    let cy = OpenAnimWidget.BarHeight - 4;
    let cx = this.barLength / 2;
    
    // We position the right bit, based on whether the left bit is present.
    if (this.visSteps === true)
      cx += intraGap + (pauseRunWidth / 2);
    
    // Used for both fast/slow "chevrons" and for up/down arrows.
    let arrowHeight = 7;
    
    if (this.visFastSlow === true)
      {
        
        // I made this a little tighter than for LoopWidget.
        let arrowOffset = 12;//18;
        let arrowDepth = 4;
        let arrowPairSpace = 3;
        let arrowThick = 1.25;
    
        // First, a pair of '>' for going faster.
        ctx.lineWidth = arrowThick;
        
        if (this.sFaster == true)
          ctx.strokeStyle = OpenAnimWidget.sColor;
        else
          ctx.strokeStyle = "black";
          
        p = new Path2D();
        p.moveTo(cx + arrowOffset, cy);
        p.lineTo(cx + arrowOffset + arrowDepth,cy + arrowHeight);
        p.lineTo(cx + arrowOffset,cy + 2*arrowHeight);
        ctx.stroke(p);           
        
        // You can't just shift a path. Needs to be rebuilt.
        p = new Path2D();
        p.moveTo(cx + arrowOffset + arrowPairSpace,cy);
        p.lineTo(cx + arrowOffset + arrowDepth + arrowPairSpace,
                 cy + arrowHeight);
        p.lineTo(cx + arrowOffset + arrowPairSpace,cy + 2*arrowHeight);
        ctx.stroke(p);
        
        // A rectangle for the clickable area.
        this.pFaster = new Path2D();
        this.pFaster.rect(cx + arrowOffset - arrowThick,cy,
              arrowPairSpace + arrowDepth + 2*arrowThick,2*arrowHeight);
        
        /*
        // BUG: testing
        ctx.strokeStyle = "green";
        ctx.lineWidth = 0.5;
        ctx.stroke(this.pFaster);
        ctx.strokeStyle = "black";
        ctx.lineWidth = arrowThick;
        */
        
        // Same idea: '<' to go slower.
        if (this.sSlower == true)
          ctx.strokeStyle = LoopAnimWidget.sColor;
        else
          ctx.strokeStyle = "black";
        
        p = new Path2D();
        p.moveTo(cx - arrowOffset,cy);
        p.lineTo(cx - arrowOffset - arrowDepth,cy + arrowHeight);
        p.lineTo(cx - arrowOffset,cy + 2*arrowHeight);
        ctx.stroke(p);           
        
        p = new Path2D();
        p.moveTo(cx - arrowOffset - arrowPairSpace,cy);
        p.lineTo(cx - arrowOffset - arrowDepth - arrowPairSpace,cy + arrowHeight);
        p.lineTo(cx - arrowOffset - arrowPairSpace,cy + 2*arrowHeight);
        ctx.stroke(p);
        
        // And the clickable area.
        this.pSlower = new Path2D();
        this.pSlower.rect(cx - arrowOffset - arrowPairSpace - arrowDepth - arrowThick,
            cy,arrowPairSpace + arrowDepth + 2*arrowThick,2*arrowHeight);
        
        /*
        // BUG: testing
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 0.5;
        ctx.stroke(this.pSlower);
        ctx.strokeStyle = "black";
        */
        
        /*
        // BUG: test box around entire thing.
        p = new Path2D();
        p.rect(cx - arrowOffset - arrowPairSpace - arrowDepth - arrowThick,cy,
            2*(arrowOffset + arrowPairSpace + arrowDepth + arrowThick),
            2*arrowHeight);
        
        //let temp = 2*(arrowOffset + arrowPairSpace + arrowDepth + arrowThick);
        //console.log("val: " +temp);
        
        ctx.strokeStyle = "red";
        ctx.stroke(p);
        */
        
        ctx.strokeStyle = "black";
      }
    
    ctx.lineWidth = 1;
    
    if (this.visPauseRun === true)
      {
        // A || or triangle for pause or run.
        
        let pauseSpace = 3.25;
        let pauseThick = 1.5;
        let pauseHeight = 2 * arrowHeight;
        
        let runThick = 1.5;
        let runLeftRight = 5;
        let runHeight = 2 * arrowHeight;
            
        if (this.sPauseRun == true)
          ctx.strokeStyle = LoopAnimWidget.sColor;
        else
          ctx.strokeStyle = "black";
              
        if (this.aRunning === true)
          {
            // The animation is running, so show || to allow pausing.
            ctx.lineWidth = pauseThick;
              
            p = new Path2D();
            p.moveTo(cx + pauseSpace,cy);
            p.lineTo(cx + pauseSpace,cy + pauseHeight);
            ctx.stroke(p);
            
            p = new Path2D();
            p.moveTo(cx - pauseSpace,cy);
            p.lineTo(cx - pauseSpace,cy + pauseHeight);
            ctx.stroke(p);
            
            ctx.lineWidth = 1;
          }
        else
          {
            // Animation is paused, so show triangle to run it again.
            ctx.lineWidth = runThick;
            
            p = new Path2D();
            p.moveTo(cx - runLeftRight,cy);
            p.lineTo(cx - runLeftRight,cy + runHeight);
            p.lineTo(cx + runLeftRight,cy + runHeight/2);
            p.closePath();
            ctx.stroke(p);
          }
        
        // Either way (paused or running), we need the clickable area.
        // This area is too generous for the "run" triangle, because
        // I use the same rectangle for "pause" and "run," but no big deal.
        this.pPauseRun = new Path2D();
        this.pPauseRun.rect(cx - runLeftRight - runThick,
          cy - runThick,2*runLeftRight + 2*runThick,runHeight + 2*runThick);
        
        /*
        // BUG: testing
        ctx.strokeStyle = "blue";
        ctx.lineWidth = 0.5;
        ctx.stroke(this.pPauseRun);
        ctx.strokeStyle = "black";
        */
      }
    
    // And position the left controls, based on whether the ones on
    // the right are present.
    cy += 12.5;
    cx = this.barLength / 2;
    if ((this.visPauseRun === true) || (this.visFastSlow === true))
      cx -= intraGap + stepsWidth/2;
    
    ctx.lineWidth = 1;
    
    // Symbols for adjusting the step size.
    if (this.visSteps === true)
      {
        // Up and down arrows. This is a little smaller than for LoopWidget,
        // so that the height matches the paure/run controls. I also
        // tightened up the spacing a bit.
        // Note that I am also using stepThick as a proxy for adjustment
        // of the fact that the tip of the arrow head is a little tall. 
        let stepSpace = 12;
        let stepThick = 2.0;
        let stepHeight = 12.5;
        let stepArrowHeight = 5.0;
        let stepArrowWidth = 4.0;
        
        ctx.lineWidth = stepThick;
        
        if (this.sDownStep === true)
          {
            ctx.strokeStyle = OpenAnimWidget.sColor;
            ctx.fillStyle = OpenAnimWidget.sColor;
          }
        else
          {
            ctx.strokeStyle = "black";
            ctx.fillStyle = "black";
          }
          
        // Vertical line
        p = new Path2D();
        p.moveTo(cx - stepSpace,cy);
        p.lineTo(cx - stepSpace,cy- stepHeight);
        ctx.stroke(p);
        
        // Arrow head
        p = new Path2D();
        p.moveTo(cx - stepSpace,cy + stepThick);
        p.lineTo(cx - stepSpace + stepArrowWidth,cy - stepArrowHeight + stepThick);
        p.lineTo(cx - stepSpace - stepArrowWidth,cy - stepArrowHeight + stepThick);
        p.closePath();
        ctx.fill(p);
        
        // Clickable area for down arrow.
        this.pDownStep = new Path2D();
        this.pDownStep.rect(cx - stepSpace - stepArrowWidth,cy - stepHeight,
            2*stepArrowWidth,stepHeight + stepThick);
        
        /*
        // BUG: testing
        ctx.strokeStyle = "blue";
        ctx.lineWidth = 0.5;
        ctx.stroke(this.pDownStep);
        ctx.strokeStyle = "black";
        ctx.lineWidth = stepThick;
        */
        
        // Again, to the right, arrow head up.
        if (this.sUpStep === true)
          {
            ctx.strokeStyle = OpenAnimWidget.sColor;
            ctx.fillStyle = OpenAnimWidget.sColor;
          }
        else
          {
            ctx.strokeStyle = "black";
            ctx.fillStyle = "black";
          }
          
        p = new Path2D();
        p.moveTo(cx + stepSpace,cy + stepThick);
        p.lineTo(cx + stepSpace,cy + stepThick - stepHeight);
        ctx.stroke(p);
        
        p = new Path2D();
        p.moveTo(cx + stepSpace,cy - stepHeight);
        p.lineTo(cx + stepSpace + stepArrowWidth,
            cy - stepHeight + stepArrowHeight);
        p.lineTo(cx + stepSpace - stepArrowWidth,
            cy - stepHeight + stepArrowHeight);
        p.closePath();
        ctx.fill(p);
        
        // Clickable area for up arrow.
        this.pUpStep = new Path2D();
        this.pUpStep.rect(cx + stepSpace - stepArrowWidth,
            cy - stepHeight,
            2*stepArrowWidth,stepHeight + stepThick);
        
        /*
        // BUG: testing
        ctx.strokeStyle = "blue";
        ctx.lineWidth = 0.5;
        ctx.stroke(this.pUpStep);
        ctx.strokeStyle = "black";
        */
        
        ctx.lineWidth = 1;
        
        // A little step icon.
        ctx.strokeStyle = "black";
        ctx.fillStyle = "black";
        stepThick = 1.5;
        let stepSize = 5;
        
        ctx.lineWidth = stepThick;
        
        // Steps made as one path, starting at upper-left
        p = new Path2D();
        p.moveTo(cx - stepSize,cy - 2*stepSize);
        p.lineTo(cx,cy - 2*stepSize);
        p.lineTo(cx,cy - stepSize);
        p.lineTo(cx + stepSize,cy - stepSize);
        p.lineTo(cx + stepSize,cy);
        ctx.stroke(p);
        
        /*
        // BUG: Testing box around it all.
        p = new Path2D();
        p.rect(cx - stepSpace - stepArrowWidth,cy - stepHeight,
          2*(stepSpace + stepArrowWidth),
          stepHeight + stepThick);
        
        ctx.strokeStyle = "red";
        ctx.lineWidth = 0.5;
        ctx.stroke(p);
        
        //let temp = 2*(stepSpace + stepArrowWidth);
        //let temp = stepHeight + stepThick;
        //console.log("val: " + temp);
        */
        
        ctx.strokeStyle = "black";
        
      }
    
    ctx.lineWidth = 1;
    
    ctx.setTransform(saveT);
  }
  
  mouseDown( x : number , y : number ) : boolean {
    
    // (x,y) is given in coordinates relative to the owning figure.
    // Return true iff these coordinates apply to this widget.
    // BUG: This is almost identical to LoopWidget. DRY?
    if (this.hide === true)
      return false;
    
    // Adjust coordinates relative to what the draw() methods uses.
    x -= this.widgetX;
    y -= this.widgetY;
    x /= this.scale;
    y /= this.scale;
    
    // The widget also has a scale, which must be taken into account.
    WidgetManager.bogusCtx.resetTransform();
    
    // The run faster area.
    if (this.pFaster !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pFaster,x,y);
        if (isin === true)
          {
            this.sFaster = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
      
    // The run slower area.
    if (this.pSlower !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pSlower,x,y);
        if (isin === true)
          {
            this.sSlower = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
      
    
    // The pause/run area.
    if (this.pPauseRun !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pPauseRun,x,y);
        if (isin === true)
          {
            this.sPauseRun = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
    
    // The longer step area.
    if (this.pUpStep !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pUpStep,x,y);
        if (isin === true)
          {
            this.sUpStep = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
    
    // The shorter step area.  
    if (this.pDownStep !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pDownStep,x,y);
        if (isin === true)
          {
            this.sDownStep = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
    
    // Last thing to check since it should be "underneath" everything,
    // although I don't think there's the same kind of overlap that
    // there was for LoopWidget.
    if (this.pDot !== null)
      { 
        // See whether the user clicked on or near the dot. He must click
        // on the dot, not at some random point along the bar.
        WidgetManager.bogusCtx.lineWidth = 2;
        let isin = WidgetManager.bogusCtx.isPointInStroke(this.pDot,x,y);
        if (isin === false)
          isin = WidgetManager.bogusCtx.isPointInPath(this.pDot,x,y);
          
        if (isin === true)
          {
            this.sDot = true;
            
            // Move the dot (slightly) so that it is centered at (x,y).
            // We don't actually "move the dot;" instead we adjust
            // this.curStep to put the dot where we want it. That is, we
            // invert g(s) = w (1-1/a^s). See the discussion, in register(), 
            // of this function. We have
            // x = w (1 - 1/a^s)
            // a^s = w / (w - x)
            // s = log_a [ w / (w - x) ]
            // And recall that log_a (z) = ln(z) / ln(a).
            let ratio = this.barLength / (this.barLength - x);
            let s = Math.log(ratio) / Math.log(this.decay);
            if (s < 0)
              s = 0;
            this.curStep = s;
            
            WidgetManager.mouseOwner = this;
            
            renderFrame(this);
    
            return true;
          }
      }
      
    return false;
  }
  
  mouseMove( x : number , y : number ) : void {
    
    // As above.
    if (this.hide === true)
      return;
    
    x -= this.widgetX;
    y -= this.widgetY;
    x /= this.scale;
    y /= this.scale;
    
    WidgetManager.bogusCtx.resetTransform();
    
    if (this.sDot === true)
      {
        // What I will do it check that the mouse is "close enough" to the 
        // bar, but it can be a long ways away.
        WidgetManager.bogusCtx.lineWidth = 20;
        let isin = WidgetManager.bogusCtx.isPointInStroke(this.pBar !,x,y);
        
        if (isin == false)
          return;
        
        let ratio = this.barLength / (this.barLength - x);
        let s = Math.log(ratio) / Math.log(this.decay);
        if (s < 0)
          s = 0;
        this.curStep = s;
        
        // The appearance of the widget may have changed.
        renderFrame(this);
      }
    
    // BUG: I might (?) want colors to change based on what the mouse
    // is over. See the BUG comment that goes with aRunning, sCircle, etc.,
    // at the top of the class.
  }
  
  mouseUp( x : number , y : number ) : void {
    
    // As above.
    if (this.hide === true)
      return;
    
    x -= this.widgetX;
    y -= this.widgetY;
    x /= this.scale;
    y /= this.scale;
    WidgetManager.bogusCtx.resetTransform();
    
    // The mouse is up, so nothing can remain selected. In most cases,
    // releasing the mouse over the selected item means that something
    // must be done since the "button" was properly pressed.
    this.sDot = false;
    
    if (this.sFaster === true)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pFaster ! ,x,y);
        if (isin === true)
          {
            this.timeStep /= 1.4;
            if (this.timeStep < 1)
              this.timeStep = 1;
            
            // Stop the animation and restart it at the new speed
            if (this.aRunning === true)
              clearInterval(this.animID);
            
            this.animID = setInterval(doAnimation,this.timeStep,this);
            this.aRunning = true;
          }
        
        this.sFaster = false;
      }
    
    if (this.sSlower === true)
      {
        // Just as above, but make it go slower.
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pSlower ! ,x,y);
        if (isin === true)
          {
            this.timeStep *= 1.4;
            
            // More than a second per frame is silly.
            if (this.timeStep > 1000)
              this.timeStep = 1000;
            
            if (this.aRunning === true)
              clearInterval(this.animID);
            
            this.animID = setInterval(doAnimation,this.timeStep,this);
            this.aRunning = true;
          }
        
        this.sSlower = false;
      }
    
    if (this.sPauseRun)
      {
        // Did they *release* the mouse over the pause/run area?
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pPauseRun ! ,x,y);
        if (isin === true)
          { 
            // Start/stop the animation.
            if (this.aRunning === true)
              // Currently running. Pause it.
              clearInterval(this.animID);
            else
              // Currently paused. Restart it.
              this.animID = setInterval(doAnimation,this.timeStep,this);
            
            // Change the pause/run icon too.
            if (this.aRunning === true)
              this.aRunning = false;
            else
              this.aRunning = true;
          }
          
        this.sPauseRun = false;
      }
     
    if (this.sUpStep === true)
      {
        // Make the number of time increments per frame larger.
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pUpStep ! ,x,y);
        if (isin === true)
          { 
            // Use a smaller ratio here. Conceptually, it seems like
            // this should be an integer, but it really doesn't have to be.
            // Unlike LoopWidget, there's no upper limit on the number
            // of steps per frame.
            this.stepsPerFrame *= 1.25;
          }
        
        this.sUpStep = false;
      }
      
    if (this.sDownStep === true)
      {
        // As above.
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pDownStep ! ,x,y);
        if (isin === true)
          this.stepsPerFrame /= 1.25;
        
        this.sDownStep = false;
      }
    
    // The appearance of the widget may have changed.
    renderFrame(this);
  }
}


// This is to allow dragging points around. After the much more complicated
// animation widgets, this is a lot easier. One difference is that dots
// are not drawn automatically; the user must call the widget's draw()
// method. This is because the order of drawing may matter -- what should
// be on top?
// 
// At one point, this was more flexible, but -- see DraggableDrawWidget below 
// -- it seems better to keep this widget simple (just dots).

class DraggableDotWidget extends Widget {
  
  // When things are "selected," draw them in this color.
  static sColor = "blue";
  
  // The clickable area for the dot, and whether it is selected.
  // pDot : Path2D | null = null;
  pDot : FPath | null = null;
  selected = false;
  
  // The default radius of a dot.
  dotRadius = 3.0;
  
  
  static register(ctx : CanvasRenderingContext2D , x : number , y : number ,
        name : string ) : DraggableDotWidget {
    
    // As with other widgets. Note that there is no scale since it doesn't
    // make sense here.
    let type = "DraggableDotWidget";
    let caller = getCaller();
    let w = <DraggableDotWidget> WidgetManager.knownWidget(caller,type,name);
    
    if (w != null)
      {
        return w;
      }
    
    // Got here, so this widget is not already known, and must be created.
    // The 'false' here means that we always assume the dot is visible. Leting
    // this be invisible would be pointless, although it is hidable by
    // directly changing the Widget.hide field.
    w = new DraggableDotWidget(caller,type,x,y,1.0,false,name);
    
    // Note the existence of this widget for the future.
    WidgetManager.register(w);
    
    // Note that we do *not* draw this widget here.
    
    return w;
  }
  
  draw(ctx : CanvasRenderingContext2D ) : void {
    
    // Because these widgets might be drawn for tikz output, this uses
    // FPath instead of Path2D.
    //
    // BUG: As a rule, I don't think people will want most widgets (like
    // LoopWidget) to be drawn to the paper version, but I suppose it should
    // be possible. *I* would like it for documentation purposes.
    
    if (this.hide === true)
      return;
    
    // Adjusting the coordinates this way feels a little weird, but it's
    // how the other widgets work, and it's actually easier.
    let saveT = ctx.getTransform();
    ctx.translate(this.widgetX,this.widgetY);
    ctx.scale(this.scale,this.scale);
    
    // BUG: Somehow, sometimes using FPath puts hair on these dots??
    // It looks like it happens where the segments meet. There's probably
    // some algebra mistake. Either that or the JS implementation of
    // bezier curves sucks. For now, I do not use bezier curves, and
    // leave it as an ellipse internally.
    let p = new FPath();
    //let p = new Path2D();
    
    let r = this.dotRadius;
    
    p.ellipse(0,0,r,r,0,0,2*Math.PI,true);
    
    //this.pDot = new Path2D(p);
    // this.pDot = new FPath(p);
    this.pDot = p;
    
    if (this.selected === true)
      ctx.fillStyle = DraggableDotWidget.sColor;
    else
      ctx.fillStyle = "red";
    
    ctx.fill(p);
    
    ctx.setTransform(saveT);
  }
  
  mouseDown(x: number , y : number ) : boolean {

    if (this.hide === true)
      return false;
      
    // Adjust coordinates relative to what the draw() methods uses.
    x -= this.widgetX;
    y -= this.widgetY;
    x /= this.scale;
    y /= this.scale;
    
    // The widget also has a scale, which must be taken into account.
    WidgetManager.bogusCtx.resetTransform();
    
    if (this.pDot !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pDot,x,y);
        if (isin === true)
          {
            this.selected = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
    
    return false;
  }
  
  mouseMove(x : number , y : number ) : void {
    
    // As above.
    if (this.hide === true)
      return;
    
    // Restrict to be within the figure area, at the least.
    // By default (the code here, not this.drawSelFcn, whatever that might
    // do), the dot doesn't get "lost," but it can be drawn partially outside
    // the figure proper, leaving "crumbs" that aren't erased until you 
    // scroll the page.
    let wh = getFigureRect(this);
    
    // Rrestrict to the entire figure rectangle, tightened up a bit.
    wh.w -= 2 * this.dotRadius;
    wh.ha -= 2 * this.dotRadius;
    wh.hb -= 2 * this.dotRadius;
    
    // Note the minus with hb. The "height below" is a postive value, but
    // we are comparing to a potentially negative y.
    if (x <= this.dotRadius) return;
    if (x >= wh.w) return;
    if (y <= -wh.hb) return;
    if (y >= wh.ha) return;
    
    if (this.selected === true)
      {
        this.widgetX = x;
        this.widgetY = y;
        
        renderFrame(this);
      }
  }
  
  mouseUp( x : number , y : number ) : void {
    
    if (this.hide === true)
      return;
    
    // This is more round-about because of the possibility that the
    // mouse-up occured outside the figure area. We need to reach
    // the renderFrame() line whatever happens.
    if (this.selected === true)
      { 
        this.selected = false;
    
        let wh = getFigureRect(this);
        
        wh.w -= 2 * this.dotRadius;
        wh.ha -= 2 * this.dotRadius;
        wh.hb -= 2 * this.dotRadius;
        
        // Note the minus with hb. The "height below" is a postive value, but
        // we are comparing to a potentially negative y.
        if ((x > this.dotRadius) && (x < wh.w) &&
            // (y > this.dotRadius) && (y < wh.h))
            (y > -wh.hb) && (y < wh.ha))
          { 
            this.widgetX = x;
            this.widgetY = y;
          }
            
        renderFrame(this);
      }
  }
}


// This is almost idential to DraggableDotWidget, except that
// there is no default drawing behavior. The user must provide it.
// 
// Maybe...
// * The user might want dots to be drawn in different ways, like a solid
//   circle, an open circle with or without a fill of some other color, or 
//   even a square "dot." 
// * The motion of the point, when dragging, needs to be restricted to a 
//   limited path or region. By default, the point is limited to the entire
//   figure area, but that may not suffice.
// * To address the two previous points, register() takes functions
//   for drawing the "dot" (which need not be a dot at all), depending
//   on whether the dot is to be drawn in selected form or unselected form.

type SimpleDrawFunction = (ctx : CanvasRenderingContext2D) => FPath;
type AcceptedDrawLocationFunction = (x : number, y : number, w : number ,
          ha : number , hb : number) => boolean;

class DraggableDrawWidget extends Widget {
  
  // When things are "selected," draw them in this color.
  static sColor = "blue";
  
  // The clickable area for the "dot" (which could have any shape)
  // and whether it is selected.
  pDot : FPath | null = null;
  selected = false;
  
  // The user must provide these functions.
  // Note the litle cheat to make the ts compiler shut its yapper.
  drawFcn : SimpleDrawFunction = null as any;
  drawSelFcn : SimpleDrawFunction = null as any;
  testPosFcn : AcceptedDrawLocationFunction = null as any;
  
  
  static register(ctx : CanvasRenderingContext2D , x : number , y : number ,
        drawFcn : SimpleDrawFunction, drawSelFcn : SimpleDrawFunction,
        testPosFcn : AcceptedDrawLocationFunction , name : string ) : DraggableDrawWidget{
    
    // The drawFcn should be defined to draw whatevever it wants.
    // It should take the ctx as the sole argument, and return a path
    // such that a click in the path (using ctx.isPointInPath()).
    //
    // The drawSelFcn is similar, but is used for drawing when the
    // item is selected -- so that the user can change the color or
    // whatever.
    //
    // The testPosFcn receives (x,y) as an argument, along with the (w,h)
    // of the figure area (in pdf points) and should return
    // true (point is acceptable) or false (not acceptable).
    
    let type = "DraggableDrawWidget";
    let caller = getCaller();
    let w = <DraggableDrawWidget> WidgetManager.knownWidget(caller,type,name);
          
    if (w != null)
      {
        return w;
      }
    
    // Got here, so this widget is not already known, and must be created.
    // The 'false' here means that we always assume the dot is visible. Leting
    // this be invisible would be pointless, although it is hidable by
    // directly changing the Widget.hide field.
    w = new DraggableDrawWidget(caller,type,x,y,1.0,false,name);
    
    w.drawFcn = drawFcn;
    w.drawSelFcn = drawSelFcn;
    w.testPosFcn = testPosFcn;
   
    // Note the existence of this widget for the future.
    WidgetManager.register(w);
    
    return w;
  }
  
  draw(ctx : CanvasRenderingContext2D ) : void {
    
    // Because these widgets might be drawn for tikz output, this uses
    // FPath instead of Path2D.
    //
    // BUG: As a rule, I don't think people will want most widgets (like
    // LoopWidget) to be drawn to the paper version, but I suppose it should
    // be possible. *I* would like it for documentation purposes.
    if (this.hide === true)
      return;
    
    // Adjusting the coordinates this way feels a little weird, but it's
    // how the other widgets work, and it's actually easier.
    let saveT = ctx.getTransform();
    ctx.translate(this.widgetX,this.widgetY);
    ctx.scale(this.scale,this.scale);
    
    if (this.selected === true)
      this.pDot = this.drawSelFcn(ctx); 
    else
      this.pDot = this.drawFcn(ctx);
    
    ctx.setTransform(saveT);
  }
  
  mouseDown(x: number , y : number ) : boolean {
    
    //console.log("dot down");
    
    if (this.hide === true)
      return false;
      
    // Adjust coordinates relative to what the draw() methods uses.
    x -= this.widgetX;
    y -= this.widgetY;
    x /= this.scale;
    y /= this.scale;
    
    WidgetManager.bogusCtx.resetTransform();
    
    if (this.pDot !== null)
      {
        let isin = WidgetManager.bogusCtx.isPointInPath(this.pDot,x,y);
        if (isin === true)
          {
            this.selected = true;
            WidgetManager.mouseOwner = this;
            renderFrame(this);
            return true;
          }
      }
    
    return false;
  }
  
  mouseMove(x : number , y : number ) : void {
    
    // As above.
    if (this.hide === true)
      return;
    
    // Restrict to be within the figure area, at the least.
    // By default (the code here, not this.drawSelFcn, whatever that might
    // do), the dot doesn't get "lost," but it can be drawn partially outside
    // the figure proper, leaving "crumbs" that aren't erased until you 
    // scroll the page.
    let wh = getFigureRect(this);
    
    if (this.testPosFcn(x,y,wh.w,wh.ha,wh.hb) === false)
      return;
    
    if (this.selected === true)
      {
        this.widgetX = x;
        this.widgetY = y;
        
        renderFrame(this);
      }
  }
  
  mouseUp( x : number , y : number ) : void {
    
    if (this.hide === true)
      return;
    
    // This is more round-about because of the possibility that the
    // mouse-up occured outside the figure area. We need to reach
    // the renderFrame() line whatever happens.
    if (this.selected === true)
      { 
        this.selected = false;
    
        let wh = getFigureRect(this);
        
        if (this.testPosFcn(x,y,wh.w,wh.ha,wh.hb) === true)
          {
            this.widgetX = x;
            this.widgetY = y;
          }
            
        renderFrame(this);
      }
  }
  
}


// A numerical value widget. This uses an HTML <input type = "number">
// thing by putting it on top of the canvas. Using HTML this way is not the
// direction I want to go, but I do want to see if it's feasible and what's
// involved. Certain widgets that already exist in HTML are probably not
// worth building from scratch as "pure canvas" widgets.  Also, this
// allows me to delay dealing with keyboard events.
//
// The idea is to put the HTML widget on top of the canvas, with absolute
// placement.
//
// NOTE: Firefox generates a warning about "ansynchronous panning." Somehow
// it sees that I'm doing something tricky and warns about it. As far as I
// can tell, I'm not doing anything likely to be deprecated or problematic
// in the future. Edge doesn't complain.

class NumberInputWidget extends Widget {
  
  // An HTML <input type = "number"> thing. This is the HTML DOM element,
  // like from document.getElementById() or createElement("input").
  theWidget : HTMLInputElement | null = null;
  
  
  static register( ctx : CanvasRenderingContext2D , x : number , y : number ,
        v : number , name : string ) : NumberInputWidget {
    
    // Even fewer arguments than usual.
    // v = initial value;
    let type = "NumberInputWidget";
    let caller = getCaller();
    let w = <NumberInputWidget> WidgetManager.knownWidget(caller,type,name);
    
    if (w != null)
      {
        w.draw(ctx);
        return w;
      }
    
    // Got here, so this widget is not already known, and must be created.
    w = new NumberInputWidget(caller,type,x,y,1.0,false,name);
    
    // Note the existence of this widget for the future.
    WidgetManager.register(w);
    
    // The usual syntax for this within HTML is
    // <input type="number" id="something" name="whatever" min="10" max="100">
    // There are some other possible settings too. See
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/number
    // 
    // BUG: There's some funny business here that I don't like at all. 
    // These DOM elements are placed relative to the body as a whole,
    // not the canvas. So, I need to know where the figure containing
    // this widget falls on the entire document. The body height is adjusted
    // when I tweak the scroll bars (mainbody.style.height and width),
    // and the widget needs to be placed relative to that.
    //
    // As a result, every time the user zooms (or resizes the window),
    // every widget placed in the DOM this way needs to be repositioned.
    // One reasonable way to deal with that is to recalculate the position
    // every time draw() is called. 
    //
    // So this isn't really a BUG; it works as intended. But using
    // HTML this way is an entirely different (and unpleasant) approach.
    
    w.theWidget = document.createElement("input");
    w.theWidget.setAttribute("type","number");
    w.theWidget.value = v.toString();
    
    w.theWidget.style.position = "absolute";
    w.theWidget.style.display = "block";
    w.theWidget.style.left = 400+"px";
    w.theWidget.style.top = 900+"px";
    w.theWidget.style.width = 50+"px";
    w.theWidget.style.height = 10+"px";
    w.theWidget.style.zIndex = "99";
    
    document.body.appendChild(w.theWidget);
    
    // The owner will want to redraw it's figure when this changes.
    w.theWidget.onchange = function() {
      
      // console.log("change");
      
      let myFunc : AugmentedDrawingFunction = getAugmentedFunction( w.owner );
      let fpc : FigurePanel = myFunc.figurePanelClass !;
      fpc.render( );
      };
    
    // Before returning the widget, it must be drawn.
    w.draw(ctx);
    
    return w;
  }
  
  getValue() {
    
    // Return the numerical value.
    //
    // BUG: This seems to return a string -- whatever is in the field.
    // The caller will typically need to do parseInt() or parseFloat()
    // on the result. If this widget were better, then it would know
    // what it's supposed to return and limit the possible things it can hold.
        
    // BUG: I should probably have getter functions for everything in
    // all widgets instead of having the user access fields directly.
    // So, define LoopWidget.getCurStep(), etc.
    // It doesn't *really* matter, but it makes it clearer to the user
    // what he's supposed to have access to.
    return this.theWidget ! .value;
  }
  
  draw(ctx : CanvasRenderingContext2D ) : void {
    
    // This widget is really an HTML DOM element, so this function doesn't
    // actually draw the widget. It repositions the element in the DOM.
    // See the discussion in register().
    
    // BUG: make accessing this information a function, like I did 
    // for getFigureRect().
    
    let myFunc : AugmentedDrawingFunction = getAugmentedFunction( this.owner );
    let fpc : FigurePanel = myFunc.figurePanelClass !;
    let totalV = fpc.totalV;
    
    // The vertical position is relatively easy, but the horizontal position
    // requires a calculation similar to fullRender() since the page
    // is centered. Also, the vertical position must be given in LH coordinates
    // relative to the entire document.
    // BUG: Make this calculation a function used in main.js too.
    // Can I combine with what's done for mouse events there too?
    // In fact, this is more like the mouse calculation than like fullRender().
    let vpos = fpc.totalV + fpc.h - this.widgetY;
    // let vpos = totalV + this.widgetY;
    
    
    // BUG: I don't like reaching into the DOM this way to get the canvas,
    // but what is the alternative?
    let hpos = this.widgetX;
    let canvas = <HTMLCanvasElement> document.getElementById("pdf_renderer");
    let visWidth = document.documentElement.clientWidth;
    let totWidth = FullPanel.getFullWidth();
    
    if (visWidth > totWidth)
      {
        // No horizontal scroll bar. Center it.
        let canvasCenter = canvas.width / 2;
        let docCenter = FullPanel.getFullWidth() / 2;
        canvasCenter = canvasCenter / PDFDocument.getZoom();
        
        hpos = hpos + (canvasCenter - docCenter);
      }
    else
      { 
        // Shift according to the horizontal scroll bar.
        hpos = hpos - window.scrollX;
      }
    
    hpos += fpc.margin;
    
    //console.log("wid at " +hpos+ " " +vpos);
    
    // Don't forget the stupid "px"!  
    this.theWidget ! .style.top = vpos +"px";
    this.theWidget  ! .style.left = hpos +"px";
  }
}

// Another DOM-based widget. A simple button.

class ButtonWidget extends Widget {
  
  // An HTML <input type = "button"> thing. 
  theWidget : HTMLButtonElement | null = null;
  
  // Sometimes you want to treat the button as a boolean
  // Each time the button is clicked, this toggles.
  clickState = false;

  // And this is set to true whenever the button is clicked.
  resetState = false;
  
  static register(ctx : CanvasRenderingContext2D , x : number , y : number ,
    text : string , name : string ) : Widget {
    
    // Even fewer arguments than usual.
    let type = "ButtonWidget";
    let caller = getCaller();
    let w = <ButtonWidget> WidgetManager.knownWidget(caller,type,name);
    
    if (w != null)
      {
        w.draw(ctx);
        return w;
      }
    
    // Got here, so this widget is not already known, and must be created.
    w = new ButtonWidget(caller,type,x,y,1.0,false,name);
    
    // Note the existence of this widget for the future.
    WidgetManager.register(w);
    
    // The usual syntax for this within HTML is
    // <button type="button" id="something" name="whatever">
    // 
    // BUG: There's some funny business here that I don't like at all. 
    // These DOM elements are placed relative to the body as a whole,
    // not the canvas. So, I need to know where the figure containing
    // this widget falls on the entire document. The body height is adjusted
    // when I tweak the scroll bars (mainbody.style.height and width),
    // and the widget needs to be placed relative to that.
    //
    // As a result, every time the user zooms (or resizes the window),
    // every widget placed in the DOM this way needs to be repositioned.
    // One reasonable way to deal with that is to recalculate the position
    // every time draw() is called. 
    //
    // So this isn't really a BUG; it works as intended. But using
    // HTML this way is an entirely different (and unpleasant) approach.
    
    w.theWidget = document.createElement("button");
    w.theWidget.setAttribute("type","button");
    w.theWidget.style.fontSize = "10px";
    w.theWidget.textContent = text;
    
    w.theWidget.style.position = "absolute";
    w.theWidget.style.display = "block";
    w.theWidget.style.left = 400+"px";
    w.theWidget.style.top = 900+"px";
    //w.theWidget.style.width = 100+"px"; // Width automatic, based on text.
    w.theWidget.style.height = 18+"px";
    w.theWidget.style.zIndex = "99";
    
    document.body.appendChild(w.theWidget);
    
    // Need to hear about clicks....
    // BUG: I would have thought that this would work, but I don't think that
    // the doClick() method is seeing the correct class instance or something.
    //w.theWidget.addEventListener('click',w.doClick,false);
    
    // Instead, define the action here.
    w.theWidget.addEventListener('click',() => {
      
    if (w.clickState === false)
      w.clickState = true;
    else
      {
        w.clickState = false;
        w.resetState = true;
      }
    
    
    // If the figure is part of an animation, then it will be drawn taking
    // into account this click in the next frame. If the figure is *not*
    // an animation, then we need to refresh.
    let myFunc : AugmentedDrawingFunction = getAugmentedFunction( w.owner );
    let fpc : FigurePanel = myFunc.figurePanelClass !;
    fpc.render();
    },false);
    
    // Before returning the widget, it must be drawn.
    w.draw(ctx);
    
    return w;
  }
  
  doClick() {
    // BUG: This doesn't work. See above.
    if (this.clickState === false)
      this.clickState = true;
    else
      this.clickState = false;
    
    //console.log("swapped click");
  }

  draw( ctx : CanvasRenderingContext2D ) : void {
    
    // This widget is really an HTML DOM element, so this function doesn't
    // actually draw the widget. It repositions the element in the DOM.
    // See the discussion in register().
    
    let myFunc : AugmentedDrawingFunction = getAugmentedFunction( this.owner );
    let fpc : FigurePanel = myFunc.figurePanelClass !;
    
    // The horizontal position requires a calculation similar to fullRender()
    // since the page is centered and the vertical position must be given
    // in LH coordinates relative to the entire document.
    // BUG: Make this calculation a function used in main.js too.
    // Can I combine with what's done for mouse events there too?
    // In fact, this is more like the mouse calculation than like fullRender().
    let vpos = fpc.totalV + fpc.h - this.widgetY;
    
    let hpos = this.widgetX;
    // BUG: Again, with the DOM access.
    let canvas = <HTMLCanvasElement> document.getElementById("pdf_renderer");
    let visWidth = document.documentElement.clientWidth;
    let totWidth = FullPanel.getFullWidth();
    
    if (visWidth > totWidth)
      {
        // No horizontal scroll bar. Center it.
        let canvasCenter = canvas.width / 2;
        let docCenter = FullPanel.getFullWidth() / 2;
        canvasCenter = canvasCenter / PDFDocument.getZoom();
        
        hpos = hpos + (canvasCenter - docCenter);
      }
    else
      { 
        // Shift according to the horizontal scroll bar.
        hpos = hpos - window.scrollX;
      }
    
    hpos += fpc.margin;
    
    // It seems that these must be placed using style.top, not style.bottom.
    // The clientHeight seems to be the height of the text in the button,
    // which style.height is the actually button. Don't forget the stupid "px"! 
    let w : HTMLButtonElement = this.theWidget ! ;
    w.style.top = (vpos - parseInt(w.style.height , 10) ) +"px";
    w.style.left = hpos +"px";
  }
}

