import gzip
import io
import lzma
import os
import sys

import click
import microviewer
import numpy as np

def root_file_ext(filename):
  filename, ext = os.path.splitext(filename)

  while True:
    filename, ext2 = os.path.splitext(filename)
    if ext2 == '':
      return ext
    ext = ext2

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

def load(filename):
  binary = load_bytesio(filename)
  ext = root_file_ext(filename)

  if ext == ".npy":
    image = np.load(binary)
  elif ext == ".nii":
    import nibabel as nib
    image = nib.load(filename)
    image = np.array(image.dataobj)
  else:
    raise ValueError("Data type not supported.")

  return image

@click.command()
@click.argument("image")
@click.argument("segmentation", required=False, default=None)
@click.option('--seg', is_flag=True, default=False, help="Display image as segmentation.", show_default=True)
@click.option('--browser/--no-browser', default=True, is_flag=True, help="Open the dataset in the system's default web browser.", show_default=True)
def main(image, segmentation, seg, browser):
  """
  View 3D images in the browser.
  """
  try:
    image_np = load(image)
    if segmentation:
      segmentation_np = load(segmentation)
  except ValueError:
    print("Data type not supported.")
    return

  if segmentation is not None:
    microviewer.hyperview(
      image_np, segmentation_np, 
      browser=browser, 
      cloudpath=[ image, segmentation ],
    )
  else:
    microviewer.view(
      image_np, seg=seg, 
      browser=browser, cloudpath=image
    )



