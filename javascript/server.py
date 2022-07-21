"""
Use this to serve the document as it is being edited. It does several things
that no normal server does. It modifies the one and only HTML file before it
is passed to the client so that the correct document is opened. It will serve
files from directories outside the server directory. This way, the user can
keep his latex files in one place and this framework stuff in a different
directory. Also, the client can send .tikz files to the server and they
will be saved in the latex directory. Some of this (maybe all?) could be done
by taking an off-the-shelf server and tweaking it, but I want to keep things
simple, both for me and for the user. Another non-standard thing is that it
handles "WHERE" requests from the browswer; these are used so that that 
documents can be loaded to open so that the are scrolled to a certain position.

To invoke this, say

python server.py directory/nameof.pdf port_num

where directory/nameof.pdf is the pdf file we want to load. If the server
stuff is in top_level/something/figput_guts/ and the latex stuff is in 
top_level/elsewhere/latex/ then, after cd-ing to 
top_level/something/figput_guts/ you need to say

python server.py ../../elsewhere/latex/thefile.pdf 8080

where the 8080 is optional, and will default to 8000. Allowing for an 
optional port number permits the user to work on several documents at once.

BUG: It is tempting to write the entire thing in a language where 
I can compile it to something that uses no outside resources. Asking 
the user to install external stuff is not ideal, even if it's only
Python. I suspect that this could be done most easily in Rust, although
C/C++ would work, or most anything that compiles to an executable. It
just needs to be easily compiled for mac/linux/windows without any
contortions.

"""

import sys
import os
import shutil
from http.server import BaseHTTPRequestHandler, HTTPServer
 
 
# By default, documents open at the top of the first page, but this
# can be used (see do_WHERE()) to change that.
verticalScrollPos = 0


# BaseHTTPRequestHandler routes requests based on the text that appears in the
# request. So "POST" is routed to do_POST(), "GET" is routed to doGET(), and
# it would be trivial to add my own request type: "WACKY" would automatically
# be routed to do_WACKY(). That's exactly wheat is done below for the WHERE
# request.

class MyServer(BaseHTTPRequestHandler):
    
    def send_head(self):
        # Open and return the relevant file, or return None.
        
        # For whatever reason, the path that comes in always starts with a '/',
        # probably to emphasize that it's relative to the "root" of the server.
        # I break that concept.
        #
        # It is tempting to have the client reqest "draw_whatever" instead
        # of "draw_whatever.js" or "draw_whatever.fjs" I could then look for
        # both types here, saving a bit of effort on the js end. However, no
        # normal server does this, so I would still need to maintain a version
        # of the js that does ask for both types for use in a typical production
        # situation.
        path = self.path[1:]
        f = None
        if (self.path == '/'):
            # Request for the one and only html file, corresponding to localhost:8000
            path = os.path.join(path,"figput.html")
        else:
            if (not os.path.exists(path)):
                # Try the latex directory. Strip off leading '/' and pre=pend latex path.
                path = self.path[1:]
                path = os.path.join(args.latex_dir,path)
        
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, "File not found")
            return None
        
        # The MIME type of the file *could* be ignored since "text/html" always
        # seems to work, but it does generate distracting error messages in the 
        # broswer.
        ctype = ""
        base, ext = os.path.splitext(path)
        if (ext == ".js"):
          ctype = "text/javascript"
        elif (ext == ".fjs"):
          ctype = "text/javascript"
        elif (ext == ".html"):
          ctype = "text/html"
        else:
          ctype = "text/plain"
          
        self.send_response(200)
        self.send_header("Content-type", ctype)
        self.end_headers()
        return f
        
    def do_HEAD(self):
        # Probably never called in my situation, although everything this
        # does must also be done for GET, so no harm in handling it.
        f = self.send_head()
        if f:
            f.close()
    
    def do_GET(self):
        f = self.send_head()
        if f:
            try:
                if (self.path == '/'):
                    # Special case of the root html file; replace 'unknown'.
                    buf = f.read()
                    buf = buf.replace(b'unknown1',bytes(args.project_name,'utf-8') )
                    buf = buf.replace(b'unknowny',bytes(str(verticalScrollPos),'utf-8') )
                    self.wfile.write(buf)
                else:
                  shutil.copyfileobj(f, self.wfile)
            finally:
                f.close()
                
    def do_POST(self):
      # self.path will be '/whatever.tikz'. Strip off the leading '/' and
      # pre-pend the latex directory. This is where the content is saved.
      dpath = self.path[1:]
      dpath = os.path.join(args.latex_dir,dpath)
      text_output_file = open(dpath,"w")
      
      # Get the length of the incoming payload and read it all.
      postLength = int(self.headers.get('content-length'))
      testmsg = self.rfile.read(postLength)
      
      # This is semi-pointless, but testmsg is a series of bytes, and 
      # write() below is looking for a string.
      newmsg = testmsg.decode("ASCII",'ignore')
      
      ignore = text_output_file.write(newmsg)
      
      text_output_file.flush()
      text_output_file.close()
      self.send_response(200, "File saved")
      self.flush_headers()
    
    def do_WHERE(self):
      # This is a trick to allow the browser to maintain the postion within the
      # document when it is reloaded. It passes the current scroll position, which
      # is then fed back to it when the document is reloaded.
      #
      # self.path is ignored. The client will send 'bogus' or the like.
      # We want the contents of the message. Start off very much as for POST.
      print("Got " +self.path);
      postLength = int(self.headers.get('content-length'))
      testmsg = self.rfile.read(postLength)
      newmsg = testmsg.decode("ASCII",'ignore')
      
      # newmsg is the postion within the document, as a string.
      global verticalScrollPos 
      verticalScrollPos = float(newmsg)
      
 
def testWhetherPDF(fpath):
    
    if (not os.path.exists(fpath)):
        print("No such file!")
        sys.exit(0)
    
    ftype = os.path.splitext(os.path.basename(fpath))[-1]
    if (ftype.lower() != ".pdf"):
        print("Not a PDF file!")
        sys.exit(0);


import argparse

parser = argparse.ArgumentParser()
parser.add_argument('file_path',help='specify path to pdf generated by LaTeX')
parser.add_argument('port', action='store', default=8000, type=int,
                    nargs='?',
                    help='specify alternate port (default: 8000)')
args = parser.parse_args()

testWhetherPDF(args.file_path)

# Parse out the directory leading to the PDF. It's used to search for js files.
# BEWARE: This is used above, as a global variable.
args.latex_dir = os.path.dirname(os.path.abspath(args.file_path))

# Do the same thing to get the name of the pdf file, without the '.pdf'.
# This is ultimately passed to the FigPut code so that it knows which file to
# open as the .pdf and as the .aux.
args.project_name = os.path.splitext(os.path.basename(args.file_path))[0]

theServer = HTTPServer(("localhost", args.port), MyServer)
print(f"Server started for http://localhost:{args.port}")

try:
    theServer.serve_forever()
except KeyboardInterrupt:
    pass

theServer.server_close()
print("Http server stopped.")
    
