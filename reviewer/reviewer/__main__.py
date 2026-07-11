# `python -m reviewer` runs the scripted demo (all scenarios, no API key needed).
import runpy, os, sys
sys.argv = ["demo.py"] + sys.argv[1:]
demo_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "demo.py")
runpy.run_path(demo_path, run_name="__main__")
