import setuptools


FORMATS = [ "nibabel", "crackle-codec" ]
OBJECTS = [ "vtk" ]

setuptools.setup(
  setup_requires=['pbr', 'numpy'],
  long_description_content_type="text/markdown",
  extras_require={
    "all_formats": FORMATS,
    "objects": OBJECTS,
    "all": FORMATS + OBJECTS,
  },
  entry_points={
    "console_scripts": [
      "uview=microviewer_cli:main"
    ],
  },
  pbr=True,
)

