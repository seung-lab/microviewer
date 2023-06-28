import setuptools

setuptools.setup(
  setup_requires=['pbr', 'numpy'],
  long_description_content_type="text/markdown",
  extras_require={
    "all_formats": ["nibabel", "crackle-codec"],
  },
  entry_points={
    "console_scripts": [
      "uview=microviewer_cli:main"
    ],
  },
  pbr=True,
)

