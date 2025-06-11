import setuptools


NII = ["nibabel"]
NRRD = ["pynrrd"]
CKL = ["crackle-codec"]
JXL = ["imagecodecs"]

FORMATS = NII + NRRD + CKL + JXL
OBJECTS = [ "vtk" ]

setuptools.setup(
  setup_requires=['pbr', 'numpy'],
  long_description_content_type="text/markdown",
  extras_require={
    "nii": NII,
    "nrrd": NRRD,
    "ckl": CKL,
    "jxl": JXL,
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

