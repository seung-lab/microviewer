from microviewer import view

import numpy as np

img = np.random.randint(0,100, size=(256,256,10), dtype=np.uint8)

view(img)