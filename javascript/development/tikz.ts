/*
Code necessary to output tikz for figures. It spoofs the normal canvas
drawing code so that the output comes here, and is then converted to 
tizk output.

One problem with JS is that there is no path interator. You can't obtain 
the segments that make up an entire path. I don't see any way around this 
other than writing my own wrapper around Path2D. It might be possible to
somehow hack the internals of Path2D, but that would be brittle, even if 
it works.

BUG: The long-term solution is to eliminate use of the JS Path2D class,
but it's not possible to entirely eliminate it since it's the only way to
draw to the browser window. What I *could* do is sub-class
CanvasRenderingContext2D so that this sub-class take my own path class
objects and converts them to Path2D for drawing. Another hurdle is 
isPointInPath(), which is used in a few places. I could provide a separate 
implementation of that, but it's fiddly. isPointInStroke() is a bit harder.

BUG: It's tempting to come up with a framework under which a "path"
is closer to our intuition of something that can be drawn as a continuous
thing, without lifting your pencil. Then, have a second-order thing that
may hold several of these continuous paths. Intuitively one wants a "path"
to have a clear start-point and end-point, but you also need to be able
to handle things like winding number for multiple paths when filling.

BUG: There are many cases where you might want the online version to be
different from what is printed. I just gave the example of filling a path,
and color is similar. There's lots of things that might make sense on a
computer screen, but wouldn't work well on printed paper.

*/


// Turns out that Point used to be part of js, but was deprecated, and
// seems not to exist any longer.

class Point2D {

  private _x : number;
  private _y : number;

  constructor(x : number,y : number) {
    this._x = x;
    this._y = y;
  }

  public toString() : string {

    // May be handy for debugging.
    return "( " + this._x.toFixed(2) + "," + this._y.toFixed(2) + ")";
  }
  
  public get x() : number {
    return this._x;
  }

  public get y() : number {
    return this._y;
  }

  public copy() : Point2D {
    return new Point2D( this._x , this._y );
  }
  
  public negate() : Point2D {
    // return -this.
    return new Point2D(-this._x,-this.y);
  }
  
  public negateSelf() : void {
  
    this._x = -this.x;
    this._y = -this.y;
  }
  
  public minus(p : Point2D) : Point2D {
    
    // return this - p. Redunant since it's just a form of translation.
    return new Point2D( this._x - p.x  , this._y - p.y );
  }
  
  public minusSelf(p : Point2D) : void {
    
    this._x -= p._x;
    this._y -= p._y;
  }

  public translate2(u : number, v : number) : Point2D {
    return new Point2D( u + this._x , v + this._y );
  }

  public translate(p : Point2D) : Point2D {
    return new Point2D( p.x + this._x , p.y + this._y );
  }

  public translateSelf2(u : number, v : number) : void {

    this._x += u;
    this._y += v;
  }

  public translateSelf(p : Point2D) : void {

    this._x += p.x;
    this._y += p.y;
  }

  public scale(s : number) : Point2D {
    return new Point2D( s * this._x , s * this._y );
  }

  public scaleSelf(s : number) : void {

    // As above, but it's done in-place rather than returning a copy.
    this._x *= s
    this._y *= s;
  }
  
  public rotate(theta : number) : Point2D {

    // Apply rotation matrix in the usual (RH) way. theta in radians.
    let c = Math.cos(theta);
    let s = Math.sin(theta);
    return new Point2D ( 
      c * this._x - s * this._y ,
      s * this._x + c * this._y
    );
  }
  
  public rotateSelf(theta : number) : void {
    
    let c = Math.cos(theta);
    let s = Math.sin(theta);
    
    let u = c * this._x - s * this._y ;
    let v = s * this._x + c * this._y ; 

    this._x = u;
    this._y = v;
  }
  
  public rotateAbout(c : Point2D , theta : number ) : Point2D {
    
    // Rotate this about c by angle theta, returning the result.
    let answer = new Point2D(this.x - c.x , this.y - c.y );
    answer = answer.rotate( theta );
    answer._x += c.x;
    answer._y += c.y;
    return answer;
  }
  
  public dot(a : Point2D) : number {

    // Return this dot a.
    return a.x * this._x + a.y * this._y;
  }

  public length() : number {
    return Math.sqrt(this._x**2 + this._y**2);
  }

  public static dot(a: Point2D , b : Point2D) : number {
    // This looks like Java-style overloading, but it's not. One dot()
    // is static and the other is not.
    return a.dot(b);
  }

  public angleBetween( a : Point2D ) : number {

    // Return angle between this and a, based on
    // this dot a = |this| |a| cos angle
    // This is the angle between the two, without any orientation.
    let cos = this.dot(a) / (this.length() * a.length() );
    return Math.acos(cos);
  }
  
  public cliffordBetween( a : Point2D) : number {
    
    // The "clifford angle," which is like angleBetween(), but it takes
    // orientation into account. The angle is given relative to ("from") this.
    return Math.atan2( this.x * a.y - a.x * this.y ,
      this.x * a.x + this.y * a.y );
  }
}

// Used for a function of the form f(t) = ( x(t) , y(t) ).
type Parametric2DFunction = (t : number) => Point2D;

// BUG: Really, these should be based on Point2D. E.g., bezier should be three Point2D objects.
type CloseSegment = {};

type MoveToSegment = {
  x : number;
  y : number;
}

type LineToSegment = {
  x : number;
  y : number;
}

type BezierToSegment = {
  cx1 : number;
  cy1 : number;
  cx2 : number;
  cy2 : number;
  x : number;
  y : number;
}

type QuadToSegment = {
  cx : number;
  cy : number;
  x : number;
  y : number;
}

type ArcSegment = {
  x : number;
  y : number;
  r : number; 
  a0 : number;
  a1 : number;
  ccw : boolean;
}

type ArcToSegment = {
  x1 : number;
  y1 : number;
  x2 : number;
  y2 : number;
  r : number; 
}

type EllipseSegment = {
  x : number;
  y : number;
  rx : number; 
  ry : number;
  rot : number;
  a0 : number;
  a1 : number;
  ccw : boolean;
}

type RectSegment = {
  x : number;
  y : number;
  w : number; 
  h : number;
}

type SegmentData = CloseSegment | MoveToSegment | LineToSegment | BezierToSegment |
        ArcSegment | ArcToSegment | EllipseSegment | RectSegment;

        
// Almost everything here is static because this is essentially a factory for the
// various segment types.

class PathSegment {
  
  // The various kinds of segment.
  // I'm being sloppy about typing here since the use is uncomplicated and
  // private. Some kind of enumerated type would be better in the abstract.
  
  // BUG: I should get rid of anything after the QUADRATIC type. The
  // mathematically clean way to do this is to convert *everything* to beziers,
  // including ellipses. In fact (?) is a quadratic just a cubic where the
  // control points coincide? If so, I could get rid of QUADRATIC too.
  static readonly MOVE_TO = 1;
  static readonly LINE_TO = 2;
  static readonly BEZIER = 3;
  static readonly QUADRATIC = 4;
  static readonly ARC = 5;
  static readonly ARC_TO = 6;
  static readonly ELLIPSE = 7;
  static readonly RECT = 8;
  static readonly CLOSE = 9;
  static readonly UNKNOWN = -1
  
  // One of the values above.
  public type = PathSegment.UNKNOWN;
  
  // The relevant data.
  // BUG: change variable name to seg.
  s : SegmentData;
    
  private constructor(kind : number , d : SegmentData) {
    this.type = kind;
    this.s = d;
  }
  
  static getClose() : PathSegment {
    let d : CloseSegment = {};
    return new PathSegment(PathSegment.CLOSE,d);
  }
  
  static getMoveTo(x : number , y : number ) : PathSegment {
    let d : MoveToSegment = { x : x , y : y };
    return new PathSegment(PathSegment.MOVE_TO,d);
  }
  
  static getLineTo( x : number, y : number ) : PathSegment {
    let d : LineToSegment = {x : x , y : y }
    return new PathSegment(PathSegment.LINE_TO,d);
  }
  
  static getBezier(cx1 : number , cy1 : number , cx2 : number , cy2 : number ,
        x  : number , y : number ) : PathSegment {
    let d : BezierToSegment = 
        {cx1 : cx1 , cy1 : cy1 , cx2 : cx2 , cy2 : cy2 , x : x , y : y};
    return new PathSegment(PathSegment.BEZIER, d );
  }
  
  static getQuadratic(cx : number , cy : number , x : number , y : number ) : PathSegment {
    let d : QuadToSegment = { cx : cx , cy : cy , x : x , y : y };
    return new PathSegment(PathSegment.QUADRATIC , d );
  }
  
  static getArc(x : number , y : number , r  : number , a0 : number , a1 : number ,
           ccw : boolean) : PathSegment {
    let d : ArcSegment = { x : x , y : y , r : r , a0 : a0 , a1 : a1 , ccw : ccw };
    return new PathSegment(PathSegment.ARC , d );
  }
  
  static getArcTo(x1 : number , y1 : number , x2 : number , y2 : number ,
         r : number ) : PathSegment {
    let d : ArcToSegment = { x1 : x1 , y1 : y1 , x2 : x2 , y2 : y2 , r : r };
    return new PathSegment(PathSegment.ARC_TO , d );
  }
  
  static getEllipse(x : number , y : number , rx : number , ry : number , rot : number ,
          a0 : number , a1 : number , ccw : boolean ) : PathSegment {
    // BUG: If I convert everything to bezier, then many of these static
    // methods can be eliminated.
    // YES. THIS IS A BAD IDEA IN EVERY WAY. ONLY BEZIER CURVES SHOULD
    // BE ALLOWED INTERNALLY.
    // OTOH, there are certain shapes, like an ellipse or rectangle, that
    // should be treated as a single unitary thing.
    // What I should probably do is sub-class FPath for these. Interally, they
    // can be represented as a messy bezier thing, but that would be hidden from the user.
    // At the same time, one might want to add an ellipse or rect to an existing path to
    // obtain various fill effects. So, the ellipse sub-class will need something like
    // a toFPath() method so that it can be added to a normal FPath.
    let d : EllipseSegment = { x : x , y : y , rx : rx , ry : ry , rot : rot , a0 : a0 ,
              a1 : a1 , ccw : ccw };
    return new PathSegment(PathSegment.ELLIPSE , d );
  }
  
  static getRect(x : number , y : number , w : number , h : number ) : PathSegment {
    let d : RectSegment = { x : x , y : y , w : w , h : h };
    return new PathSegment(PathSegment.RECT , d );
  }
  
}


// BUG: Add some flags so that things could be drawn or not drawn based
// on whether the output is going to tikz or to the screen. 

class FPath extends Path2D {
  
  // An array of PathSegments.
  segs : PathSegment[] = [];
  
  
  constructor() {
    super();
  }
  
  addPath(p : FPath ) : void {
    
    // Append the elements of p to this. 
    for (let i = 0; i < p.segs.length; i++)
      this.segs.push(p.segs[i]);
  }
  
  closePath () : void {
    super.closePath();
    this.segs.push(PathSegment.getClose());
  }
  
  moveTo(x : number , y : number) : void {
    super.moveTo(x,y);
    this.segs.push(PathSegment.getMoveTo(x,y));
  }
  
  frontLineTo(x : number , y : number ) : void {
    
    // To tack a line segment to the *begining* of an existing path.
    // This assumes that segs[0] is a moveTo() -- as I think (?) it must be
    // in any reasonable case. 
    // So, you start with a path that looks like
    // moveTo(a,b) ...whatever
    // and it becomes
    // moveTo(x,y) lineTo(a,b) ...whatever.
    // You're basically drawing as usual, but "from the wrong end."
    let s = this.segs[0];
    if (s.type != PathSegment.MOVE_TO)
      console.log("ERROR: frontLineTo() doesn't start with moveTo(): " +s.type);
    
    let newfirst = PathSegment.getMoveTo(x,y);
    
    // Convert the initial moveto to a lineto.
    // In fact, this is sort of pointless, and is only done this way to respect
    // the type-checker. It's (x,y) whether it's a lineto or a moveto.
    let m = <MoveToSegment> s.s;
    let newsecond = PathSegment.getLineTo(m.x,m.y);
    
    this.segs[0] = newsecond;
    this.segs.unshift(newfirst);
  }
  
  lineTo(x : number , y : number ) : void {
    super.lineTo(x,y);
    this.segs.push(PathSegment.getLineTo(x,y));
  }
  
  bezierCurveTo(cx1 : number , cy1 : number , cx2 : number , cy2 : number ,
         x : number , y : number ) : void {
    super.bezierCurveTo(cx1,cy1,cx2,cy2,x,y);
    this.segs.push(PathSegment.getBezier(cx1,cy1,cx2,cy2,x,y));
  }
  
  quadraticCurveTo(cx : number , cy : number , x : number , y : number ) : void {
    super.quadraticCurveTo(cx,cy,x,y);
    this.segs.push(PathSegment.getQuadratic(cx,cy,x,y));
  }
  
  translate(p : Point2D) : FPath {
    
    // Translate this entire path by the given point.
    
    // BUG: Not implemented for every possible type of segment.
    
    let answer = new FPath();
    for (let i = 0; i < this.segs.length; i++)
      {
        let s = this.segs[i];
        if (s.type == PathSegment.MOVE_TO)
          {
            let m = <MoveToSegment> s.s;
            answer.moveTo(m.x + p.x,m.y + p.y);
          }
        else if (s.type == PathSegment.LINE_TO)
          {
            let m = <LineToSegment> s.s;
            answer.lineTo(m.x + p.x,m.y + p.y);
          }
        else if (s.type == PathSegment.BEZIER)
          {
            let m = <BezierToSegment> s.s;
            answer.bezierCurveTo( m.cx1 + p.x , m.cy1 + p.y ,
                m.cx2 + p.x , m.cy2 + p.y , m.x + p.x , m.y + p.y );
          }
        else if (s.type == PathSegment.ELLIPSE)
          {
            let m = <EllipseSegment> s.s;
            answer.ellipse(m.x+p.x,m.y+p.y , m.rx, m.ry, m.rot , m.a0 , m.a1 , m.ccw);
          }
        else
          {
            console.log("whatever translattion you want, it's not done.");
          }
      }
    
    return answer;
  }
  
  rotate( a : number ) : FPath {
    
    // Rotate this entire path about the origin and return the result.
    
    // BUG: I have only implemented this for bezier curves and lines.
    // Expanding this probably doesn't make sense until I settle on a
    // framework to more fully replace Path2D.
    
    let answer = new FPath();
    for (let i = 0; i < this.segs.length; i++)
      {
        let s = this.segs[i];
        if (s.type == PathSegment.MOVE_TO)
          {
            let m = <MoveToSegment> s.s;
            let p = new Point2D( m.x , m.y ).rotate( a );
            answer.moveTo(p.x,p.y);
          }
        else if (s.type == PathSegment.LINE_TO)
          {
            let m = <LineToSegment> s.s;
            let p = new Point2D( m.x , m.y ).rotate( a );
            answer.lineTo(p.x , p.y);
          }
        else if (s.type == PathSegment.BEZIER)
          {
            let m = <BezierToSegment> s.s;
            let c1 = new Point2D( m.cx1 , m.cy1 ).rotate( a );
            let c2 = new Point2D( m.cx2 , m.cy2 ).rotate( a );
            let e = new Point2D( m.x , m.y ).rotate( a );
            answer.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,e.x,e.y);
          } 
        else
          {
            console.log("whatever rotation you want, it's not done.");
          }
      }
    
    return answer;
  }
  
  scale( r : number ) : FPath {
    
    // Scale this entire path about the origin and return the result.
    
    // BUG: I have only implemented this for bezier curves and lines.
    
    let answer = new FPath();
    for (let i = 0; i < this.segs.length; i++)
      {
        let s = this.segs[i];
        if (s.type == PathSegment.MOVE_TO)
          {
            let m = <MoveToSegment> s.s;
            let p = new Point2D( r * m.x , r * m.y );
            answer.moveTo(p.x,p.y);
          }
        else if (s.type == PathSegment.LINE_TO)
          {
            let m = <LineToSegment> s.s;
            
            // BUG:
            console.log("scale not done for lines");
          }
        else if (s.type == PathSegment.BEZIER)
          {
            let m = <BezierToSegment> s.s;
            let c1 = new Point2D( r * m.cx1 , r* m.cy1 );
            let c2 = new Point2D( r * m.cx2 , r * m.cy2 );
            let p = new Point2D( r * m.x , r * m.y );
            answer.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,p.x,p.y);
          } 
        else
          {
            console.log("whatever scale you want, it's not done.");
          }
      }
    
    return answer;
  }
  
  reflectX() : FPath {
    
    // Reflect this entire path about the x-axis and return the result.
    
    // BUG: not implemented for every case.
    
    let answer = new FPath();
    for (let i = 0; i < this.segs.length; i++)
      {
        let s = this.segs[i];
        if (s.type == PathSegment.MOVE_TO)
          {
            let m = <MoveToSegment> s.s;
            let p = new Point2D( m.x , -m.y );
            answer.moveTo(p.x,p.y);
          }
        else if (s.type == PathSegment.LINE_TO)
          {
            let m = <LineToSegment> s.s;
            let p = new Point2D( m.x , -m.y);
            answer.lineTo(p.x,p.y);
          }
        else if (s.type == PathSegment.BEZIER)
          {
            let m = <BezierToSegment> s.s;
            let c1 = new Point2D( m.cx1 , -m.cy1 );
            let c2 = new Point2D( m.cx2 , -m.cy2 );
            let p = new Point2D( m.x , -m.y );
            answer.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,p.x,p.y);
          } 
        else if (s.type == PathSegment.ELLIPSE)
          {
            let m = <EllipseSegment> s.s;
            answer.ellipse(m.x,-m.y,m.rx,m.ry,m.rot,m.a0,m.a1,m.ccw);
          }
        else
          {
            console.log("whatever reflect you want, it's not done.");
          }
      }
    
    return answer;
  }
  
  reflectXY() : FPath {
    
    // Reflect this entire path about the x-axis AND y-axis.
    
    // BUG: not implemented for every case.
    // BUG: Also, what about reflectY()?
    
    let answer = new FPath();
    for (let i = 0; i < this.segs.length; i++)
      {
        let s = this.segs[i];
        if (s.type == PathSegment.MOVE_TO)
          {
            let m = <MoveToSegment> s.s;
            let p = new Point2D( -m.x , -m.y );
            answer.moveTo(p.x,p.y);
          }
        else if (s.type == PathSegment.LINE_TO)
          {
            let m = <LineToSegment> s.s;
            // BUG:
            console.log("reflect not done for lines");
          }
        else if (s.type == PathSegment.BEZIER)
          {
            let m = <BezierToSegment> s.s;
            let c1 = new Point2D( -m.cx1 , -m.cy1 );
            let c2 = new Point2D( -m.cx2 , -m.cy2 );
            let p = new Point2D( -m.x , -m.y );
            answer.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,p.x,p.y);
          } 
        else
          {
            console.log("whatever reflect you want, it's not done.");
          }
      }
    
    return answer;
  }
  
  rotateAbout(a : number , p : Point2D ) : FPath {
  
    // Rotate this entire path about p and return the result.
    let t1 = this.translate(new Point2D(-p.x,-p.y));
    let t2 = t1.rotate(a);
    return t2.translate(p);
  }
  
  
  static arcToBezierNEW( r : number , a0 : number , a1 : number ) : FPath {
    
    // Generate a series of bezier curves to represent an arc. The result
    // represents an arc of a circle of radius r, centered 
    // at (0,0), going from angle a0 to a1, in radians. 
    
    // Each step should subtend no more than pi/4 radians. Most of the
    // time pi/2 would be accurate enough, but pi/4 is better, and not that 
    // much extra work.
    let totalAngle = a1 - a0;
    if (totalAngle < 0)
      totalAngle += 2*Math.PI;
    
    let numCurves = Math.ceil(4 * totalAngle / Math.PI);
    
    let subtend = totalAngle / numCurves;
    
    // See the manual for where this comes from. It's the crucial constant
    // for approximating arcs of circles by cubics.
    let k = (4/3) * Math.tan(subtend/4);
    
    // Everything is built out of a single arc for a circle of radius r,
    // going cw, starting at (1,0) and angle subtend.
    let s = Math.sin(subtend);
    let c = Math.cos(subtend);
    
    let p1 = new Point2D (r,0);
    let p2 = new Point2D (r,r*k);
    let p3 = new Point2D (r*(c+k*s),r*(s-k*c));
    let p4 = new Point2D (r*c,r*s);
    
    // The arc determined by the p_i above must be rotated to create
    // a series of sub-arcs to get the total arc we want.
    let answer = new FPath();
    
    answer.moveTo(p1.x,p1.y);
    for (let i = 0; i < numCurves; i++)
      {
        answer.bezierCurveTo(p2.x,p2.y,p3.x,p3.y,p4.x,p4.y);
        
        p2.rotateSelf(subtend);
        p3.rotateSelf(subtend);
        p4.rotateSelf(subtend);
      }
    
    // Rotate the entire thing so that it starts at a0.
    answer = answer.rotate(a0);
    
    return answer;
  }
  
  arc(x : number , y : number , r : number , a0 : number , a1 : number , ccw : boolean) : void {
    
    // BUG: I am pretty sure this isn't right. There are things about 
    // being cw/cww and things like that. It needs to be tested.
    
    // A circular arc, centered at (x,y) and radius r, from angle
    // a0 to angle a1 (in radians), going cw or ccw. Like ellipse, this 
    // is basically independent of the surrounding segments. Actually,
    // the documentation I've found is a little vague on this point, 
    // but it looks like that is how it works.
    //
    // Another issue is the fact that these angles, a0 and a1, may
    // have "extra" multiples of 2pi in them and whether a1>a0.
    // The first thing this does is reduce the angles to be in [0,2pi).
    //
    // The whole cw versus ccw issue amounts to whether you're getting
    // the "large" arc or the "small" arc. If a1 > a0, then the ccw arc
    // is the small arc and the cw arc is the large arc. If a1 < a0,
    // then the ccw arc is the large arc and the cw arc is the small arc.
    // To untangle this, assume that the arc will be treated ccw, and
    // swap a1 and a0, if necessary, to make that the case.
    //
    // Finally, there's the issue of what cw and ccw mean when in
    // left or right handed coordinate systems. Ugh.
    //
    // See 
    // https://pomax.github.io/bezierinfo/#circles_cubic
    // for an explanation of the math, which is just HS algrbra.
    // 
    // 
    // BUG: Seems like this is a special case of an arc of an ellipse.
    
    if (ccw === undefined)
      ccw = false;
    
    // Reduce angles to be in [0,2pi).
    while (a0 < 0)
      a0 += 2*Math.PI;
    while (a1 < 0)
      a1 += 2*Math.PI;
    
    while (a0 >= 2*Math.PI)
      a0 -= 2*Math.PI;
    while (a1 >= 2*Math.PI)
      a1 -= 2*Math.PI;
    
    // If the user asked for cw, then swap the angles so that we only
    // need to consider the ccw case below.
    if (ccw === true)
      {
        let temp = a1;
        a1 = a0;
        a0 = temp;
      }
    
    // Get the various arcs for a circle centered at zero.
    let arcs = FPath.arcToBezierNEW(r,a0,a1);
    
    // Translate them all by (x,y).
    arcs = arcs.translate(new Point2D(x,y));
    
    this.addPath(arcs);
  }
  
  ellipse(x : number , y : number , rx : number , ry : number , rot : number ,
        a0 : number , a1 : number , ccw : boolean) : void {
    
    // BUG: Long-term, the right thing to do here is convert it (internally)
    // to a series of bezier curves.
    if (ccw === undefined)
      ccw = false;
    super.ellipse(x,y,rx,ry,rot,a0,a1,ccw);
    this.segs.push(PathSegment.getEllipse(x,y,rx,ry,rot,a0,a1,ccw));
  }
  
  rect(x : number , y : number , w : number , h : number ) : void {
    
    // BUG: As above, make into a series of line segments. This one is easy.
    super.rect(x,y,w,h);
    this.segs.push(PathSegment.getRect(x,y,w,h));
  }
  
  static circArcToBezier(r : number , a0 : number , a1 : number ) : FPath {
    
    // Return a series of n bezier curves for a circle of radius r, extending
    // from r(cos a0,sin a0) to r (cos a1,sin a1).
    //  
    // BUG: This should really be part of ellipse().
    
    let answer = FPath.arcToBezierNEW(r,a0,a1);
      
    return answer;
  }
  
  static parametricToBezier(f : Parametric2DFunction , 
        t0 : number , t1 : number ,n : number) : FPath {
    
    // Given a 2D parametric curve, f(t) = x(t),y(t)), this returns a bezier
    // approximation from t=t0 to t=t1 by taking n time-steps. Obviously,
    // f must be a function returning f.x and f.y. 
    //
    // This works by sampling f (n+1) times, plus n times at the in
    // between points, and fitting a Bezier to each trio of points. It
    // follows the notes in the "main" manual. This is a hard problem -- or
    // a messy one. There are various strategies. The one used here is to
    // choose the tangent at the intermediate point (which I call B) to be
    // parallel to the line between the two end-points of the Bezier segment.
    // This is relatively straightforward, but one problem with this is that
    // the slopes where these segments meet need not be the same -- the
    // resulting curve is not G_1. I'm pretty sure that I worked out a method
    // once that was based (somehow?) on the way MetaPost works, but it's
    // complicated and messy and uses complex numbers.
    let p = new FPath();
    
    let p1 : Point2D = f(t0);
    p.moveTo(p1.x,p1.y);
    
    for (let i = 0; i < n; i++)
      { 
        let p4 : Point2D = f(t0 + (i+1)*(t1-t0)/n);
        let B = f(t0 + (i+0.5)*(t1-t0)/n);
        
        // Work out an appropriate value for t based on relative distances.
        let d1 = Math.sqrt((B.x-p1.x)**2 + (B.y-p1.y)**2);
        let d2 = Math.sqrt((B.x-p4.x)**2 + (B.y-p4.y)**2);
        let t = d1 / (d1+d2);
        
        // The p4 to p1 vector:
        let V = new Point2D(p4.x - p1.x,p4.y-p1.y);
        
        // e1 = B - (1-t)(p4-p1)/3 and e2 = B + t(p4-p1)/3.
        let e1 = new Point2D(B.x - (1-t)*V.x/3,B.y - (1-t)*V.y/3);
        let e2 = new Point2D(B.x + t*V.x/3,B.y +t*V.y/3);
        
        // Run de Casteljau's algorithm backwards. I call this alpha too,
        // but r is a better name since it's a ratio.
        let r = 1 - 1 / (t**3 + (1-t)**3);
        let u = (1-r)*(1-t)**3;
        let C = new Point2D(p1.x*u + p4.x*(1-u),p1.y*u + p4.y*(1-u));
        let A = new Point2D(B.x + (C.x-B.x)/r,B.y + (C.y-B.y)/r);
        let v1 = new Point2D((e1.x - A.x*t)/(1-t),(e1.y - A.y*t)/(1-t));
        let v2 = new Point2D((e2.x - A.x*(1-t))/t,(e2.y - A.y*(1-t))/t);
        let p2 = new Point2D((v1.x - p1.x*(1-t))/t,(v1.y - p1.y*(1-t))/t);
        let p3 = new Point2D((v2.x - p4.x*t)/(1-t),(v2.y - p4.y*t)/(1-t));
        
        p.bezierCurveTo(p2.x,p2.y,p3.x,p3.y,p4.x,p4.y);
        
        p1 = p4.copy();
      }
    
    return p;
  }
}

// Text is a special case because it expects a LH coordinate system, but 
// everything else is set up for a RH coordinate system. The end-user
// shouldn't make a direct call to ctx.fillText(). If he does, then the
// the text will be upside-down. So, call this instead.
//
// Getting the placement of the js to match the placement of the tikz exactly
// is difficult because they're using two different fonts. So the tikz
// is drawn at (x+dx,y+dy). The dx and dy are optional and default to zero.
//
// BUG: I *could* create a class, something like FPath, to handle all drawing 
// of text, which may be more natural to the user. But I would probably have 
// to extend CanvasRenderingContext2D somehow and use that everywhere, not 
// just when creating TikZ. For now, this is a sufficient solution.
// Another approach would be to overwrite the existing 
// CanvasRenderingContext2D.fillText method to call the function below.
// In some ways, that's the "right" thing to do, but my gut is that
// it could lead to various problems and make the code generally brittle.

function drawText(ctx : CanvasRenderingContext2D, txt : string, 
      x : number , y : number , dx = 0 , dy = 0) : void {
  
  let saveT = ctx.getTransform();
  
  if (ctx instanceof CTX)
    {
      // Don't fool around. Just write it to the .tikz file.
      // BUG: The ts compiler complains about this, but it works fine.
      ctx.fillText(txt , x + dx , y + dy );
      ctx.setTransform(saveT);
      return;
    }
  
  // Get the measurements -- all we really care about is the baseline. 
  // Transform the ctx so that the horizontal line at y becomes the 
  // origin, flip the scale, and draw at (x,0).
  //
  // Recapitulating the info on MDN, we care about m.actualBoundingBoxAscent
  // and m.actualBoundBoxDescent, which give distances from ctx.textBaseline
  // to the relevant side of the bounding box of the text. The baseline 
  // defaults to the 'alphabetic' setting, which puts the baseline just
  // under where you normally draw the letter -- B sits on the baseline,
  // while p hangs below it.
  let m : TextMetrics = ctx.measureText(txt);
  
  ctx.translate(0,y);
  ctx.scale(1,-1);
  ctx.textBaseline = 'bottom';
  ctx.fillText(txt , x , 0 );
  
  ctx.setTransform(saveT);
}

// As above, but these to draw the text in only one scenario or
// the other. This could be handled with boolean arguments to the
// above, but this seems clearer for the user.
function drawTextBrowserOnly(ctx : CanvasRenderingContext2D | CTX, txt : string, 
      x : number , y : number , dx = 0 , dy = 0) : void {

  if (ctx instanceof CTX)
    // Skip it.
    return;
  
  drawText(ctx,txt,x,y,dx,dy);
}

function drawTextTikZOnly(ctx : CanvasRenderingContext2D | CTX, txt : string, 
  x : number , y : number , dx = 0 , dy = 0) : void {

  if (ctx instanceof CTX)
    ctx.fillText(txt , x + dx , y + dy );
}


// This is to act much like the object returned from 
// canvas.getContext('2d').
// Only a few elements of the standard context class are needed.
// I purposely did *not* make this extend CanvasRenderingContext2D.
// By not extending, you can't accidentally make use of some feature
// of the normal ctx framework and have it silently fail.
// 
// This is one major difference. Each time you want to render a figure,
// you need a new one of these since the tikz text goes out to a file
// with a different name. In principle, it would be possible to allow
// reusing these, but there's no value in allowing for that. 

// I had hoped not to need to deal with transformation matricies, and
// just (implicitly) use the identity matrix. However, certain things
// are easier for the user if they are permitted. See
// www.alanzucconi.com/2016/02/10/tranfsormation-matrix
// for a brief summary of how these work.
// 
// Think of the matrix as R in the upper left, for rotation etc, and 
// (tx,ty,1) in the right column for translation, with M as the overall
// matrix. The bottom row is always (0 0 1). If the user gives (x y) as
// some position relative to M, then the "real" position is M(x y 1).
// By "real" I mean that position relative to the identity matrix.
//
// BUG: I think I am doing this the wrong way. As things stand, I store
// the thing the user does (the path and any points or whatever that
// specify) in terms given by the user. Then I convert those values to
// their "unadjusted" values when written to tikz output. Instead, I should
// convert things as they come in. For one thing, as things stand, if
// the user adjusts the t-matrix as things are drawn, it would mess up
// everything. This would also side-step certain questions like what
// a shear transformation should mean for something like an ellipse. If
// we correct things as just described, then an ellipse is an ellipse,
// and it is not shear-transformed, although the points where ellipse
// is located would be shear-transformed.
//
// BUG: Add a flag, like CTX.paper, and set is to true here.
// That way, the rendering process can output something different on paper.
// This flag will be undefined when run in a browser.
  
class CTX {
  
  // Transformation matrix.
  // BUG: Try to get rid of this. I think that, now that all drawing is
  // done with a RH system, this is unnecessary. Everything related to
  // tmatrix is private and I think it's effectively unused.
  private tmatrix = [[1,0,0],[0,1,0],[0,0,1]]; 
  
  // BUG: This is *not* the right way to do things, but it's easier.
  // The problem is in scaling lengths, which are not points. This is a
  // particular problem with radii. The proper solution is to work this value
  // out from the tmatrix, but that's messy.
  // This is why things like ellipses should be treated as beziers.
  private netScale = 1.0;
  
  // To allow the user to set the linewidth. Otherwise, tikz uses a 
  // default value of 0.4pt. Tikz has certained named line widths, like
  // 'semithick' and 'ultra thin' but I don't care about those. It's better
  // to stick with numerical values to be consistent with js.
  // This name matches what's used in a "normal" ctx.
  // The way to specify line width in tikz is as an option to \draw:
  // \draw[line width = 1mm]  ...whatever...
  // for example.
  lineWidth = 1.0;
  
  // File name (without the '.tizk') for the figure.
  figureName = "";
  
  // This holds the output as it is generated.
  tikzstr = "";
  
  
  constructor(name : string) {
    
    // Provide the name of the figure whose tikz is being generated.
    // This goes to a file, which is fiddly with js. The contents of the
    // file will be sent to the server, and it is assumed that the server
    // knows what to do. A normal HTTP server will choke on it (really,
    // it will just ignore it).
    //
    // As each call to stroke(),  fill(), and so forth is made, the corresponding
    // tikz is noted.  When all these are calls are done, call close() to write it out.
    this.figureName = name; 
    this.tikzstr = ""; 
    
    // The tikz file needs a bit of a heading. 
    this.tikzstr += "\\begin{tikzpicture}\n";

    // And everything is clipped to the permitted drawing area. To obtain
    // that area, we need to look at the figure specification.
    let myFunc : AugmentedDrawingFunction = getAugmentedFunction ( name );
    let fpc : FigurePanel = myFunc.figurePanelClass !;
    
    // Neither one really seems to give the right thing.
    // Maybe use \clip as an option to 
    // \begin{tikzpicture}[\clip something?]
    //this.tikzstr += "\\clip (0bp,0bp) rectangle (" +fpc.textWidth+ 
    //    "bp," + fpc.h+ "bp);\n";
    this.tikzstr += "\\useasboundingbox (0bp,0bp) rectangle (" +fpc.textWidth.toFixed(2)+ 
        "bp," + (fpc.h - fpc.lowerPadding - fpc.upperPadding).toFixed(2)+ "bp);\n";
  }
 
  close() {
    
    // Finalize the tikz specification, and write it out.
    // 
    // Note that, under Firefox, this generates an error on the console:
    //
    // XML Parsing Error: no root element found
    // Location: http://localhost:8000/geartest01.tikz
    // Line Number 1, Column 1:
    //
    // or whatever the file name is that's saved. Apparently this is a
    // "known issue" (aka, a bug) with Firefox. No such message appears
    // with MS Edge. It works the same either way.
    this.tikzstr += "\\end{tikzpicture}\n";
    
    // BUG: No doubt there is a more modern fetch() way to do this.
    let req = new XMLHttpRequest();
    
    // This is *really* not the standard way to do things.
    // Pass the file name to save under, then the text to save.
    // I *should* be passing some cgi script that takes input, but
    // I've tweaked the http server so that it's non-standard,
    // and does what I want instead of what it is supposed to do.
    let fname = this.figureName + ".tikz";
    req.open("POST",fname);
    
    // I have no idea whether this is really necessary.
    req.setRequestHeader("Content-Type","text/plain;charset=UTF-8");
    
    req.send(this.tikzstr);
  }
  
  private static clone3x3Matrix(m : number[][]) : number[][] {
    
    // JS seems not to have a standard way of creating a copy of a matrix.
    // This does it for a 3x3 matrix and returns the result.
    let a : number[][] = [];
    a[0] = [];
    a[0][0] = m[0][0];
    a[0][1] = m[0][1];
    a[0][2] = m[0][2];
    
    a[1] = [];
    a[1][0] = m[1][0];
    a[1][1] = m[1][1];
    a[1][2] = m[1][2];
    
    a[2] = [];
    a[2][0] = m[2][0];
    a[2][1] = m[2][1];
    a[2][2] = m[2][2];
    
    return a;
  }
  
  private getTransform()  : number[][] {
    return CTX.clone3x3Matrix(this.tmatrix);
  }
  
  private setTransform(t : number[][]) : void {
    this.tmatrix = CTX.clone3x3Matrix(t);
  }
  
  private translate(tx : number , ty : number ) : void {
    
    // Adjust the transformation matrix. Going forward, this will have the
    // effect of converting (x,y) to (tx + x,ty+y) whenever the user
    // refers to (x,y).  
    this.tmatrix[0][2] += tx;
    this.tmatrix[1][2] += ty;
  }
  
  private scale(sx : number , sy : number ) : void {
    
    // Scale the transformation matrix.
    // Let S = diag(sx,sy,1). The new t-matrix is the old t-matrix times S.
    // 
    // BUG: I am not sure. Maybe it should be S times old t-matrix, and
    // I have the order wrong. For the time being it doesn't matter since
    // every case I care about has sx=sy and the matrices commute in that
    // special case.
    this.tmatrix[0][0] *= sx;
    this.tmatrix[0][1] *= sy;
    
    this.tmatrix[1][0] *= sx;
    this.tmatrix[1][1] *= sy;
    
    // Track this here too.
    // BUG: This assumes that sx = xy.
    this.netScale *= sx;
  }
  
  private applyTMatrix(x : number , y : number ) : {x : number , y : number } {
    
    // Return tmatrix times (x,y). As a matrix operation, this is
    // tmatrix x (x y 1), but we only return the first two entries.
    let ax = this.tmatrix[0][0] * x + this.tmatrix[0][1] * y + this.tmatrix[0][2];
    let ay = this.tmatrix[1][0] * x + this.tmatrix[1][1] * y + this.tmatrix[1][2];
    
    return {x: ax, y: ay};   
  }
  
  handlePath(path : FPath ) : void {
    
    // Called by either fill() or stroke().
    var segs = path.segs;
    
    for (let i = 0; i < segs.length; i++)
      {
        // s is a PathSegment object.
        let s = segs[i];
        
        if (s.type == PathSegment.MOVE_TO)
          {
            let m = <MoveToSegment> s.s;
            let t = this.applyTMatrix(m.x,m.y);
            //this.tikzstr += "(" +s.x+ "pt, " + s.y+ "pt) ";
            this.tikzstr += "(" +t.x.toFixed(2)+ "bp, " + t.y.toFixed(2)+ "bp) ";
          }
        else if (s.type == PathSegment.LINE_TO)
          {
            // Lines are drawn with the tikz \draw command. It takes the form
            // \draw [options] (x1,y1) -- (x2,y2);
            // Note that I include "bp" for the dimensions. I think that tikz
            // defaults to cm if no dimension is given, so I should specify 
            // something. Note also that I use bp, not pt.
            // 
            // BUG: I am not sure whether the tikz point is 72ppi or 72.27 ppi
            // to match latex.
            // 
            // BUG: For the time being, I will ignore these options, but they 
            // can be things like fill or dashed, or to set the color or line
            // width, and probably a mess of other stuff. 
            let m = <LineToSegment> s.s;
            let t = this.applyTMatrix(m.x,m.y);
            this.tikzstr += "-- (" +t.x.toFixed(2)+ "bp, " + t.y.toFixed(2)+ "bp) ";
          }
        else if (s.type == PathSegment.BEZIER)
          {
            // The sources I found aren't very explicit about exactly how
            // this is implemented. I assume it's done in the usual way.
            // We have
            // P(t) = B(3,0)*CP + B(3,1)*P1 + B(3,2)*P2 + B(3,3)*P3,
            // where t\in [0,1] and B are the usual Bernstein polynomials (the
            // functions of t):
            // B(n,m) = C(n,m) t^m (1-t)^(n-m),
            // and C is the choice function.
            
            // See also the tikz/pgf manual (v3.1.9a), p. 156, for the output.
            // However the manual is wrong, or not clear. Use 'and' between
            // the control points.
            //
            // The gist is that CP is fixed point where the curve starts;
            // it's implicit for both Java and tikz. P1 and P2 are the control
            // points and P3 is where the curve terminates. Fortunately this
            // matches up nicely with the tikz syntax.
            let m = <BezierToSegment> s.s;
            let t1 = this.applyTMatrix( m.cx1 , m.cy1);
            let t2 = this.applyTMatrix( m.cx2 , m.cy2);
            let t3 = this.applyTMatrix( m.x , m.y);
            
            this.tikzstr += 
              ".. controls (" +t1.x.toFixed(2)+ "bp, " +t1.y.toFixed(2)+ "bp) and (" +
                t2.x.toFixed(2)+ "bp, " +t2.y.toFixed(2)+ "bp) .. (" +
                t3.x.toFixed(2)+ "bp, " +t3.y.toFixed(2)+ "bp)";
          }
        else if (s.type == PathSegment.QUADRATIC)
          {
            // BUG: Put this back.
            console.log("quadratic does not work");
            // Tikz has this too (whew). Oddly, it's part of the pgf stuff.
            // Everything else is drawn with \draw (or \fill), but this
            // uses \pgfpathquadraticcurveto. I'm not sure if that matters,
            // and I hope that you can mix these freely in the middle of 
            // a \draw command. The tikz/pgf manual isn't very clear on
            // mixing these. 
            // BUG: I wonder if I should be using commands like \pgflineto, 
            // \pgfcurveto, and so forth, throughout what I've done.
            // See the tikz/pgf manul (v3.1.9a), p. 1095.
            //
            // BUG: I'm going to code this hoping that it works, but I suspect
            // that it will not, and will need to go back and change to 
            // something other than \draw or \fill to start with.
            // Maybe I need to define an entire path and then \draw or \fill 
            // it? It looks like you define that path, then say
            // \pgfusepath{fill} or whatever.
            // 
            // BUG: Maybe I could convert this to a cubic here and avoid this
            // entire messy issue?
            //
            // NOTE: pgf has some nice commands for drawing only *part* of 
            // a Bezier curve. See p. 1097 for \pgfpathcurvebetweentime.
            
            // BUG: Maybe I'll be lucky and this is never called.
            // I think (?) it must be that the only time this type of
            // segment ever arises is if the user users a QuadCurve2D, which
            // seems (?) unlikely.
            /*
            let t1 = this.applyTMatrix(s.cx,s.cy);
            let t2 = this.applyTMatrix(s.x,s.y);
            
            //this.tikzstr += 
            //  "\\pgfpathquadraticcurveto {\\pgfpoint{" +
            //    s.cx+ "pt}{" +x.cy+ "pt}}{\\pgfpoint{" +
            //    s.x+ "pt}{" +s.y+ "pt}}";
            this.tikzstr += 
              "\\pgfpathquadraticcurveto {\\pgfpoint{" +
                t1.x+ "bp}{" +t1.y+ "bp}}{\\pgfpoint{" +
                t2.x+ "bp}{" +t2.y+ "bp}}";
              */
          }
        else if (s.type == PathSegment.ARC)
          {
            console.log("arc");
            // This is a circular arc of a circle
            // centered at (x,y) over a given range of angles (cw or ccw).
            //
            // BUG: For the remaining cases, I may need to do something
            // special. It's not clear exactly what the browser is doing
            // with these. Are they converted, internally, to bezier
            // curves or are they somehow rendered more directly. 
            
            this.tikzstr += "no arc implemented"; 
          }
        else if (s.type == PathSegment.ARC_TO)
          {
            console.log("arc to not done");
            // This is essentially a bezier curve.
            // You have two control points and a radius. It is not
            // clear exactly how it works.
            
            this.tikzstr += "no arcTo implemented";
          }
        else if (s.type == PathSegment.ELLIPSE)
          {
            // BUG: This will only draw a complete ellipse, not an arc of
            // an ellipse.
            // BUG: The foolishness with netScale is another reason not
            // to allow an ellipse type. If an ellipse were really a series
            // of bezier curves, then this would be a non-issue.
            let m = <EllipseSegment> s.s;
            
            let c = this.applyTMatrix( m.x , m.y );
            
            //console.log(s.x+ "," +s.y+ " becomes " +c.x+ " " +c.y);
            
            //this.tikzstr += "(" +c.x+ "pt," +c.y+ 
            //  "pt) ellipse [x radius=" +s.rx*this.netScale+ 
            //  "pt,y radius =" + s.ry*this.netScale+ "pt]";
            
            this.tikzstr += "(" +c.x.toFixed(2)+ "bp," +c.y.toFixed(2)+ 
              "bp) ellipse [x radius=" + (m.rx * this.netScale).toFixed(2)+ 
              "bp,y radius =" + (m.ry * this.netScale).toFixed(2)+ "bp]";
          }
        else if (s.type == PathSegment.RECT)
          {
            console.log("rect not done");
            this.tikzstr += "no rect implemented";
          }
        else if (s.type == PathSegment.CLOSE)
          {
            this.tikzstr += "-- cycle";
          }
        else
          {
            console.log("unknown FPath: " +s.type);
          }
      }
     
    this.tikzstr += ";\n";
  }

  stroke(path : FPath ) : void {
    
    let segs = path.segs;
    if (segs.length === 0)
      return;
    
    this.tikzstr += "\\draw[line width=" +this.lineWidth.toFixed(2)+ "bp] ";
    
    this.handlePath(path);
  }
  
  fill(path : FPath ) : void {
    
    let segs = path.segs;
    if (segs.length === 0)
      return;
    
    this.tikzstr += "\\fill ";
    
    this.handlePath(path);
  }
  
  fillText(s : string , x : number , y : number ) : void {
    
    // BUG: This is now done with top-level functions now and shouldn't
    // be called (or callable) by outside code.
    // 
    // BUG: I have my doubts about including this one. It needs to be done
    // *somehow*, but I am concerned about a mismatch between the JS
    // font and the fonts used by latex.
    // 
    // BUG: I am ignoring the ctx.font setting. It does seem that if you
    // set it to '10px san-serif' you get something reasonable for the
    // browswer that doesn't look too different than latex.
    //
    // BUG: This is so fussy that I suspect that any drawing that is at
    // all tricky will require that the user provide different placement for
    // text on the browser and text on the page. Getting things to match
    // up *exactly* may be impossible. 
    
    let t = this.applyTMatrix(x,y);
    // I had this as 'anchor=south west', but 'base west' seems closer
    // to what latex does. 
    // BUG: It's all a mystery.
    this.tikzstr += 
      "\\node [anchor=base west] at (" +t.x.toFixed(2)+ "pt, " +t.y.toFixed(2)+ "pt) {" +s+ "};\n";
     
    
  }
  
}



// A grab-bag of numerical techniques.
// BUG: This doesn't really belong in this file.

type FunctionRealtoReal = ( x : number ) => number;

class Numerical {
  
  static newton(f : FunctionRealtoReal , g : number, a : number , b : number ,
    y : number , e : number ) : number {
    
    // Given a function, f, and an initial guess, g, bracketed between a and b,
    // for the argument to f, and a target value, y, this returns x such that
    // f(x) = y to within error, e.
    //  
    // A crude off-the-cuff implementation of Newton-Raphson.
    // This will only work in the tamest situations.
    //
    // Recall that the idea is that
    // f(x0 + dx) ~ f(x0) + f'(x0) dx
    // We want y = f(x + dx) and that is approximately equivalent to
    // y = f(x0) + f'(x0) dx or dx = ( y - f(x0) ) / f'(x0)
    // so that x0 becomes x1 = x0 + dx = x0 + ( y - f(x0) ) / f'(x0)
    //
    // NOTE: I had hoped to avoid the need to bracket entirely, and for
    // some functions (and sufficiently good initial guesses), you could,
    // but it's too easy for the algorithm to get lost among local extrema
    // if there is no bracket.
    //
    // In fact, here is a good example of why bracketing is needed.
    // Let f = cos x + x sin x, which happens to be the x-coordinate for
    // the parameterization of the unit involute. Suppose that you want
    // to find x for which f(x) = 1.5, and you start off with a guess of
    // x = 0.5. The slope of f at 0.5 is small so that Newton-Raphson
    // sends x1 to a value that is beyond the inflection point near x = 3.
    // At that point things go haywire.
    
    let x0 = g;
    let y0 = f(x0);
    
    let i = 0;
    
    while (Math.abs(y-y0) > e)
      { 
        let fplus = f(x0+e);
        let fminus = f(x0-e);
        let fprime = (fplus - fminus) / (2*e);
        
        let dx = (y - y0) / fprime;
        let x1 = x0 + dx;
        
        // Make sure we haven't passed a bracket. Just subdivide if we have.
        if (x1 > b)
          x1 = (x1-x0)/2;
        if (x1 < a)
          x1 = (x0-x1)/2; 
        
        x0 = x1;
        y0 = f(x0);
        
        // Don't allow an infinite loop
        ++i;
        if (i > 100)
          return x0;
      }
    
    return x0;
  } 
 
} 
