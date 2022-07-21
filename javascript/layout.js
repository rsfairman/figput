"use strict";
/*
Code for page layout. The idea is a bit like Java Swing (or a zillion other
similar setups), but stripped down to only what I need. In particular, the
Panels are assumed to be stacked vertically.

Everything is accessed through FullPanel, which consists of a list of
PagePanel objects. These are stacked vertically, and each one contains at
least one PDFPanel, and may contain FigurePanels. In the lingo of something
like Java, it would be better to think of PagePanel as a Container or a Box
since it's used for layout and doesn't directly do anything other than pass
things to its sub-parts.

*/
// This class is the only thing that should be touched by code outside
// this file. FullPanel.init() is called to set up page layout.  Everything
// is static since there is only one window/canvas.
class FullPanel {
    static init(specList) {
        // Add all the pages to this document. specList is PDFDocument.pageSpecs. 
        // Each element of specList corresponds to page.
        // Call this once, when the program starts, to set up the page layout.
        let cumV = 0;
        for (let i = 0; i < specList.length; i++) {
            let pp = new PagePanel(i, specList[i], cumV);
            this.thePages[i] = pp;
            cumV += pp.h;
        }
    }
    static async renderAll(height) {
        // Render every PagePanel in FullPanel.thePages.
        // Internal to this function, the height should be in "page pixels," 
        // meaning the number of pixels tall the destination canvas is at the 
        // current zoom ratio of the offsreen pages.
        height = height / PDFDocument.getZoom();
        // Because of the use of promises by pdf.js, rendering is broken into
        // two steps: pre-render and the actual rendering. Pre-rendering
        // generates a bunch of promises (the pages rendered offscreen) and
        // rendering can't be done until those promises resolve.
        let ps = [];
        for (let i = 0; i < this.thePages.length; i++) {
            let p = this.thePages[i].preRender(height);
            ps.push(p);
        }
        // Don't return until this is done! 
        await Promise.all(ps);
        for (let i = 0; i < this.thePages.length; i++)
            this.thePages[i].render(height);
        // Eliminate any excess pages from the buffer of offscreen pages.
        // Do this after copying out, just in case there *is* some weird
        // problem with race conditions.
        PDFDocument.trimBuffer();
    }
    static totalHeight() {
        // Return the total height of all pages. This is used to set up 
        // the scroll bars.
        let answer = 0;
        for (let i = 0; i < this.thePages.length; i++)
            answer += this.thePages[i].h;
        return answer;
    }
    static getFullWidth() {
        // Return the width of the widest page. Most of the time, the pages of
        // a document all have the same width, but they might not in some
        // rare case. This is needed to center things left/right in the window.
        if (this.totalWidth > 0)
            return this.totalWidth;
        // Need to calculate it for the first time.
        for (let i = 0; i < this.thePages.length; i++) {
            let pp = this.thePages[i];
            if (pp.w > this.totalWidth)
                this.totalWidth = pp.w;
        }
        return this.totalWidth;
    }
    static mouseDown(x, y) {
        // (x,y) is in pdf points, relative to the  entire document.
        // So y will be a huge number if it's on the umpteeth page.
        // To save CPU, I could start off by checking whether x is in 
        // [0,pageWidth] and return if it is not, but the user might want to
        // place controls outside the page. This is unlikely, but possible.
        // Whoever had focus loses it. It may be taken up by some other widget
        // (or the same widget again), but nobody has focus by default.
        WidgetManager.focusOwner = null;
        // Figure out which page this is and hand it off.
        let i = 0;
        for (; i < this.thePages.length; i++) {
            if (this.thePages[i].v > y) {
                // Found the first and only page this could be. It was the
                // page previous to this one.
                i -= 1;
                break;
            }
        }
        // If we got here then it had to be the very last page.
        if (i === this.thePages.length)
            i = this.thePages.length - 1;
        // Safety check:
        if ((i == this.thePages.length) || (i < 0))
            return;
        this.thePages[i].mouseDown(x, y);
    }
    static mouseMove(x, y) {
        // As above. However, these are only of interest if some widget
        // "owns" the mouse -- something was clicked on so that motion
        // could mean something.
        if (WidgetManager.mouseOwner === null)
            return;
        // Although we know exactly which widget will ultimately get this
        // event, it's easier to let this pass through the layout hierarchy,
        // just as for mouseDown(), so that the coordinates are properly adjusted.
        // BUG: Not DRY.
        let i = 0;
        for (; i < this.thePages.length; i++) {
            if (this.thePages[i].v > y) {
                i -= 1;
                break;
            }
        }
        if (i === this.thePages.length)
            i = this.thePages.length - 1;
        if ((i == this.thePages.length) || (i < 0))
            return;
        this.thePages[i].mouseMove(x, y);
    }
    static mouseUp(x, y) {
        // The big issue here is that the mouse was released so that ownership 
        // is once again up for grabs. In addition, certain widgets will want
        // to know where the mouse was released. Buttons are a good example.
        // You could have mouse-down on the button, then the user moves the
        // mouse out of the button and releases it; the button should only be
        // "clicked" if the mouse was released over the button.
        //
        // An annoying thing here is that the *only* widget that could care about
        // this (at least, as designed) is the one that owns the mouse-down.
        // As above, we want the event to pass through the layout hierarchy
        // so that (x,y) is adjusted for the right frame, but the ultimate
        // *consumer* of the event may not even be on the page where the
        // mouse-up occured.
        // BUG: Not DRY.
        if (WidgetManager.mouseOwner === null)
            return;
        let i = 0;
        for (; i < this.thePages.length; i++) {
            if (this.thePages[i].v > y) {
                i -= 1;
                break;
            }
        }
        if (i === this.thePages.length)
            i = this.thePages.length - 1;
        if ((i == this.thePages.length) || (i < 0))
            return;
        this.thePages[i].mouseUp(x, y);
        // Whatever happened above, the mouse is now up for grabs.
        WidgetManager.mouseOwner = null;
    }
}
// The full document consists of a list of PagePanel objects.
// thePages[i] is the i-th page, counting from zero.
FullPanel.thePages = [];
// The width of the widest page of the entire document. Don't access
// this directly; use getFullWidth().
FullPanel.totalWidth = -1;
// A PagePanel is the top-level thing, just under the canvas. Each
// PagePanel makes up a single page of the printed document. There's
// a list of them in FullPanel. It includes references to the PDFPanel 
// and FigurePanel objects that it contains.
class PagePanel {
    constructor(pageNum, pageSpec, v) {
        // Every panel has a vertical position within the entire document and height,
        // in pdf pts. The vertical postion, v, is the top of the page, so the page
        // extends from v to v+h. The caller must ensure that the Panels stack up
        // correctly since there is no real page layout.
        //
        // In some ways the height, h, is redundant since it could be worked
        // out from the heights of the individual sub-parts. In fact (see below)
        // it *is* worked out by the constuctor, but it's easier to do it once
        // and be done with it. This is the height of the page, as rendered,
        // taking into account any mismatch due to extra "padding" in the figures
        // (if there is any, and there often is not).
        this.v = 0;
        this.w = 0;
        this.h = 0;
        // page number, counting from zero.
        this.pageNum = 0;
        // The SubPanels that make up this PagePanel.
        this.parts = [];
        // This implicitly applies to the global (because everything is static)
        // PDFDocument. pageNum is which page this is, counting from zero.
        // pageSpec has the info about how the page breaks into pieces and the
        // relevant figures. v is where this page lies in the entire vertical 
        // list of pages.
        this.w = pageSpec.pageWidth;
        this.v = v;
        this.pageNum = pageNum;
        // Create the PDFPanels and FigurePanels in this PagePanel.
        let s = pageSpec;
        if (s.insertPoint.length == 0) {
            // There are no figures on this page.
            let p = new PDFPanel(pageNum, this.v, 0, 0, this.v, this.w, s.pageHeight);
            this.h = s.pageHeight;
            this.parts = [p];
        }
        else {
            // There are figures.
            let srcV = 0;
            let destV = 0;
            let totalV = v;
            for (let j = 0; j < s.insertPoint.length; j++) {
                // Bit of pdf above figure.
                let p = new PDFPanel(pageNum, this.v, srcV, destV, totalV, this.w, s.insertPoint[j] - srcV);
                destV += s.insertPoint[j] - srcV;
                totalV += s.insertPoint[j] - srcV;
                let f = new FigurePanel(this.v, destV, totalV, this.w, s.deleteHeight[j] + s.aboveHeight[j] + s.belowHeight[j], s.aboveHeight[j], s.belowHeight[j], s.leftMargin, s.textWidth, s.drawFcn[j]);
                srcV = s.insertPoint[j] + s.deleteHeight[j];
                destV += s.deleteHeight[j] + s.aboveHeight[j] + s.belowHeight[j];
                totalV += s.deleteHeight[j] + s.aboveHeight[j] + s.belowHeight[j];
                this.parts.push(p);
                this.parts.push(f);
            }
            // And the bit of pdf below the last figure on the page.
            let p = new PDFPanel(pageNum, this.v, srcV, destV, totalV, this.w, s.pageHeight - srcV);
            this.parts.push(p);
            this.h = destV + s.pageHeight - srcV;
        }
    }
    async preRender(height) {
        // This renders the underlying page of pdf. It returns a promise
        // so that the caller can wait for the promise to resolve before
        // attempting to copy from the rendered page.
        //
        // The vpos is where the top of the ctx should be relative to the entire
        // document, in pdf pts, and height is how much is visible, in rendered
        // page pixels.
        // The first question is whether any of this page is visible.
        let vpos = window.scrollY;
        if (this.v + this.h < vpos)
            // Entire page is above the visible area.
            return;
        if (this.v > vpos + height)
            // Entire page is below the visible area.
            return;
        // Got here, so some portion of the page is visible.
        await PDFDocument.render(this.pageNum);
    }
    render(height) {
        // Render every SubPanel of the current PagePanel.
        // BUG: Before returning, turn off any of these animations that are
        // definitely not visible.
        let vpos = window.scrollY;
        if (this.v + this.h < vpos)
            return;
        if (this.v > vpos + height)
            return;
        // Got here, so some portion of the page is visible. From here on, 
        // render everything, whether it's actually visible or not.
        let ctx = ctxTopLevelAdjust();
        // Call the parts of the page. These could be PDFPanel or FigurePanel
        // objects.
        for (let i = 0; i < this.parts.length; i++)
            this.parts[i].render();
        // BUG: I don't like this use of zoom here. Maybe no choice?
        let z = PDFDocument.getZoom();
        // Put a rectangle aroud the entire page. I'm not 100% convinced that
        // I like this.
        ctx.strokeStyle = "black";
        ctx.strokeRect(0, 0, this.w * z, this.h * z);
    }
    mouseDown(x, y) {
        // Mouse clicked on this page.
        // y is given relative to the entire document; make it page-relative.
        y -= this.v;
        // Only clicks on a figure could be of interest.
        for (let i = 0; i < this.parts.length; i++) {
            // Either a PDFPanel or a FigurePanel.
            let p = this.parts[i];
            if (p instanceof PDFPanel)
                continue;
            // p must be a FigurePanel.
            if ((p.destV <= y) && (y <= p.destV + p.h))
                return p.mouseDown(x, y);
        }
    }
    mouseMove(x, y) {
        // As above. Note that this event could go to the "wrong" figure,
        // but that's OK. Also, if the mouse is over a PDFPanel, and not
        // a figure, then the event dies here, which is also OK.
        y -= this.v;
        for (let i = 0; i < this.parts.length; i++) {
            let p = this.parts[i];
            if (p instanceof PDFPanel)
                continue;
            if ((p.destV <= y) && (y <= p.destV + p.h))
                p.mouseMove(x, y);
        }
    }
    mouseUp(x, y) {
        // As above, but the event can't be allowed to die. The owning widget
        // must hear about the mouse up. At the same time, we can't just
        // inform the widget directly of the mouse up since we also need to
        // pass the correct coordinates. 
        y -= this.v;
        for (let i = 0; i < this.parts.length; i++) {
            let p = this.parts[i];
            // This is different than above since *somebody* must take the event,
            // and the relevant widget must hear about it. If the event is over
            // a PDFPanel, then tell the widget using crazy coordinates. It 
            // doesn't matter exactly where the mouse was released; it only 
            // matters that it wasn't released anywhere near the widget.
            if ((p.destV <= y) && (y <= p.destV + p.h)) {
                if (p instanceof PDFPanel)
                    WidgetManager.mouseOwner.mouseUp(10000000000000, 10000000000000);
                else
                    // Over a figure.
                    p.mouseUp(x, y);
            }
        }
    }
}
// A PagePanel consists of one or more SubPanels.
class SubPanel {
    constructor(v, totalV, w, h) {
        // The vertical position and height within a page, with zero being at the
        // top, and measured in pdf points. This height, h, is the total height.
        // There's no ambiguity to this height for PDFPanel subclasses, but for
        // FigurePanel subclasses, it is the sum of the latex height 
        // (PageData.deleteHeight), plus any additional padding as given in 
        // PageData.aboveHeight/belowHeight.
        this.destV = 0;
        this.h = 0;
        this.w = 0;
        // The position of this panel within the entire document.
        // The only reason for this is the possible use of HTML DOM elements
        // as widgets within a figure. I would prefer not to use those at all,
        // but sometimes it's easier. See the NumberInputWidget for one example.
        this.totalV = 0;
        this.destV = v;
        this.totalV = totalV;
        this.w = w;
        this.h = h;
    }
    // Will be filled in by sub-class.
    render() {
        console.log("Error: called SubPanel.render()!");
    }
    mouseDown(x, y) {
        console.log("Error: called SubPanel.mouseDown()!");
    }
    mouseMove(x, y) {
        console.log("Error: called SubPanel.mouseMove()!");
    }
    mouseUp(x, y) {
        console.log("Error: called SubPanel.mouseUp()!");
    }
}
// Used for portions of a page consisting of rendered pdf.
class PDFPanel extends SubPanel {
    constructor(pageNum, offsetV, srcV, destV, totalV, w, h) {
        // The pageNum is given relative to the global PDFDocument. The srcV
        // and destV are locations relative to the page (in pdf points, with the
        // top of the page at v=0) and h is the height of this piece, which
        // is the same for src and dest.
        super(destV, totalV, w, h);
        // The page numbers start at zero and positions are given in pdf points.
        this.pageNum = 0;
        this.srcV = 0;
        // BUG: I think I can fold this in elsewhere. It's the same as PagePanel.v.
        this.offsetV = 0;
        this.pageNum = pageNum;
        this.srcV = srcV;
        this.offsetV = offsetV;
    }
    render() {
        // Render a portion of the current page. 
        let theCanvas = PDFDocument.getCanvas(this.pageNum);
        if (theCanvas === null) {
            // I'm sure how this happens, but it does occasionally.
            // It doesn't cause any noticable problems. It seems to happen
            // if you move the scroll thumb too fast.
            return;
        }
        // BUG: I don't like this use of zoom here. Maybe no choice?
        let z = PDFDocument.getZoom();
        let ctx = ctxTopLevelAdjust();
        // Adjust for scroll bar.
        ctx.translate(0, (this.offsetV - window.scrollY) * z);
        // Arguments here: 
        // the source image (or canvas),
        // the source (x,y),
        // the source (width,height),
        // the destination (x,y),
        // the destination (width,height),
        // It's confusing because optional things typically come after
        // required things, but not here somehow.
        ctx.drawImage(theCanvas, 0, this.srcV * z, theCanvas.width, this.h * z, 0, this.destV * z, theCanvas.width, this.h * z);
    }
}
class FigurePanel extends SubPanel {
    constructor(pageV, destV, totalV, w, h, upperPadding, lowerPadding, margin, textWidth, drawFcn) {
        // As for PDFPanel, plus the margin is the amount by which to shift the 
        // drawing to the right so that the origin is in line with the text.The 
        // drawFcn is the function provided through Latex.
        // This is just the name of the function, as a string.
        super(destV, totalV, w, h);
        // Page's v position. This is the position of the page on which
        // this figure appears relative to the entire document.
        this.pageV = 0;
        // This margin is the location of the left edge of the text, as
        // reported by latex.
        this.margin = 0;
        // Also from Latex (via figures.aux). This I have more confidence in.
        this.textWidth = 0;
        // The height in SubPanel.h is the total height of the figure, including
        // any padding above or below. The origin used for the figure occurs at
        // a y-value that is PageData.belowHeight *above* the total height.
        // lowerPadding is equal to PageData.belowHeight for this figure.
        this.lowerPadding = 0;
        this.upperPadding = 0;
        this.pageV = pageV;
        this.upperPadding = upperPadding;
        this.lowerPadding = lowerPadding;
        this.margin = margin;
        this.textWidth = textWidth;
        this.drawFcn = drawFcn;
    }
    render() {
        // Save this for widgets and animations to use.
        let ctx = ctxTopLevelAdjust();
        let z = PDFDocument.getZoom();
        ctx.translate(0, (this.pageV - window.scrollY) * z);
        // Erase the full width of the page. this.w is the correct width,
        // but the origin will be shifted for drawing. So, erase, then 
        // return the origin to where it was and start over.
        // Shift to where the figure appears and erase.
        ctx.translate(0, this.destV * z);
        ctx.scale(z, z);
        // The small adjustment here is to prevent erasing the rectangle
        // that encloses the entire page.
        ctx.clearRect(1, 0, this.w - 2, this.h);
        // Return to the orginal t-matrix, then shift down and right before
        // drawing the figure (and widgets).
        // What we want is for the origin to be at the lower-right and
        // right-handed, adjusted upwards by this.lowerPadding too.
        ctx = ctxTopLevelAdjust();
        ctx.translate(0, (this.pageV - window.scrollY) * z);
        ctx.translate(this.margin * z, (this.destV + this.h - this.lowerPadding) * z);
        ctx.scale(1, -1);
        ctx.scale(z, z);
        // Tack this FigurePanel onto the underlying figure-drawing code.
        // The first time the figure is rendered, this is set, and it's re-set
        // to the same value with every subsequent call. That seems like 
        // pointless extra work, but it gets the job done.
        this.drawFcn.figurePanelClass = this;
        this.drawFcn(ctx);
    }
    mouseDown(x, y) {
        // (x,y) is in pdf points, relative to the top-left of the page.
        // Adjust to be relative to the figure, but still LH, relative
        // to the top of the figure.
        y -= this.destV;
        x -= this.margin;
        // y is now given relative to the top edge of the figure, getting
        // larger as you go *down* the page.
        // Convert y to be RH relative to the correct origin, taking
        // any padding into account. This is confusing. At this stage,
        // y is the distance below the figure's top edge. Call that y0.
        // We want the distance above the lower padding (if any); call
        // that y1. The distance above the lower *edge* of the figure 
        // is this.h - y0, and from this we subtract the padding.
        y = (this.h - y) - this.lowerPadding;
        // Pass to the relevant widget.
        WidgetManager.mouseDown(this.drawFcn, x, y);
    }
    mouseMove(x, y) {
        // As above.
        y -= this.destV;
        x -= this.margin;
        y = (this.h - this.lowerPadding) - y;
        WidgetManager.mouseMove(this.drawFcn, x, y);
    }
    mouseUp(x, y) {
        // As above.
        y -= this.destV;
        x -= this.margin;
        y = (this.h - this.lowerPadding) - y;
        WidgetManager.mouseUp(this.drawFcn, x, y);
    }
}
