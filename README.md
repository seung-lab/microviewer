[![PyPI version](https://badge.fury.io/py/microviewer.svg)](https://badge.fury.io/py/microviewer)

# microviewer
Multiplatform 3D numpy image browser based viewer.

```python
from microviewer import view, hyperview

view(numpy_image) # for gray and color images
view(numpy_image, seg=True) # for segmentation labels
view(numpy_image, seg=True, port=8082)

hyperview(image, labels) # interactive overlay
```

```bash
uview image.npy.gz # view as image
uview labels.npy.gz --seg # view as segmentation
uview image.npy.gz labels.npy.gz # view image w/ overlay
uview image.npy.gz --paint # view image w/ blank overlay
```

![Segmentation display in microviewer](seg-demo.png "Segmentation display in microviewer.")

Visualize 3D numpy arrays in your browser without difficult installation procedures or reformatting your data.  The code is CPU based and the image is uncompressed in memory. You're limited to images that are at most 2^31 bytes large (~2.1 GB) due to browser limitations.

## Features

- 3 axis visualization of 3D images.
- Grayscale images with segmentation overlay.
- Segmentation selection with brush tools.
- Direct voxel painting.
- Save segmentation as [.npy](https://numpy.org/neps/nep-0001-npy-format.html) or [.ckl](https://github.com/seung-lab/crackle), an advanced compresssion format.
- Undo/Redo

## Supports

- 8-bit grayscale 3D images
- color images (including 3 channel 3D images)
- floating point images
- boolean images
- segmentation labels
- .npy, .ckl, or .nii format

For .ckl and .nii formats, you must separately install crackle-codec and nibabel respectively.

## Installation

```bash
pip install "microviewer[all_formats]"
```

all_formats will install all supported formats for the CLI. By default, only .npy filesare supported.

## History

This microviewer package has been a part of CloudVolume since 2018, but is now broken out into its own package for more flexible wider use. Microviewer uses a modified version of https://github.com/seung-lab/data-cube-x/ (2016) to represent the array in Javascript, which was originally developed for eyewire.org.



