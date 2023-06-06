import gzip
import io
import lzma
import os
import sys

import click
import microviewer
import numpy as np

def load_bytesio(filelike):
  if hasattr(filelike, 'read'):
    binary = filelike.read()
  elif (
    isinstance(filelike, str) 
    and os.path.splitext(filelike)[1] == '.gz'
  ):
    with gzip.open(filelike, 'rb') as f:
      binary = f.read()
  elif (
    isinstance(filelike, str) 
    and os.path.splitext(filelike)[1] in ('.lzma', '.xz')
  ):
    with lzma.open(filelike, 'rb') as f:
      binary = f.read()
  else:
    with open(filelike, 'rb') as f:
      binary = f.read()
  
  return io.BytesIO(binary)

@click.command()
@click.argument("image")
@click.option('--seg', is_flag=True, default=False, help="Display image as segmentation.", show_default=True)
@click.option('--browser/--no-browser', default=True, is_flag=True, help="Open the dataset in the system's default web browser.", show_default=True)
def main(image, seg, browser):
	"""
	View 3D images in the browser.
	"""
	image = np.load(load_bytesio(image))
	microviewer.view(image, seg=seg, browser=browser)



