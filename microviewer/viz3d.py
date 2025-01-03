from typing import Sequence, Union, Any

from collections import defaultdict

import numpy as np

def hex2color(color):
  b = (color & 0xff) / 255.0
  g = ((color >> 8) & 0xff) / 255.0
  r = ((color >> 16) & 0xff) / 255.0
  return (r,g,b)

# created with help of https://coolors.co/001021-ffa400-009ffd-eaf6ff-9e7b9b
COLORS = [
  (1.0, 0.6431372549019608, 0.0), # alice blue (white)
  (0.0, 0.6235294117647059, 0.9921568627450981), # orange
  (0.9176470588235294, 0.9647058823529412, 1.0), # celestial blue
  (0.8941176470588236, 0.5843137254901961, 0.6196078431372549), # salmon
  (0.9411764705882353, 0.2196078431372549, 0.4196078431372549), # cerise
  (0.6, 0.8666666666666667, 0.7843137254901961), # tiffany blue (green)
  (0.8117647058823529, 0.6941176470588235, 0.7176470588235294), # tearose red
  (0.8980392156862745, 0.3254901960784314, 0.5058823529411764), # blush
  (0.7647058823529411, 0.7647058823529411, 0.9019607843137255),# periwinkle
]

BBOX_COLORS = [
  0xE9D758, # yellow
  0x06D6A0, # emerald
  0x00ABE7, # picton blue
  0xF58549, # orange (crayola)
  0xEDC9FF, # mauve
]
BBOX_COLORS = [ hex2color(c) for c in BBOX_COLORS ]

def toiter(obj, is_iter=False):
  if isinstance(obj, (str, dict, np.ndarray)):
    if is_iter:
      return [ obj ], False
    return [ obj ]

  try:
    iter(obj)
    if is_iter:
      return obj, True
    return obj 
  except TypeError:
    if is_iter:
      return [ obj ], False
    return [ obj ]

def is_mesh(obj):
  """zmesh meshes are fine, but not covered by cloudvolume.Mesh"""
  return hasattr(obj, "vertices") and hasattr(obj, "faces")

def is_skeleton(obj):
  return hasattr(obj, "vertices") and hasattr(obj, "edges")

def is_bbox(obj):
  return hasattr(obj, "minpt") and hasattr(obj, "maxpt")

def is_point_cloud(obj):
  return isinstance(obj, np.ndarray) and obj.ndim == 2

# vtk code written with help of ChatGPT
def objects(
  objects:Sequence[Any],
):
  """
  Produce a 3D co-visualization of meshes and skeletons together.
  """
  objects = toiter(objects)

  pairs = defaultdict(list)

  bboxes = [
    obj 
    for obj in objects 
    if is_bbox(obj)
  ]

  for obj in objects:
    if hasattr(obj, "id"):
      pairs[obj.id].append(obj)
    elif hasattr(obj, "segid"):
      pairs[obj.segid].append(obj)
    elif hasattr(obj, "label"):
      pairs[obj.label].append(obj)
    else:
      pairs[None].append(obj)

  actors = []
  for obj in pairs[None]:
    if is_mesh(obj):
      actors.append(
        create_vtk_mesh(obj, opacity=1.0)
      )
    elif is_skeleton(obj):
      actors.extend(
        create_vtk_skeleton(obj)
      )
    elif is_point_cloud(obj):
      actors.append(
        create_vtk_point_cloud(obj)
      )

  pairs.pop(None)

  segids = []

  for i, (label, objs) in enumerate(pairs.items()):
    segids.append(label)
    mesh_opacity = 1.0
    for obj in objs:
      if is_skeleton(obj):
        mesh_opacity = 0.2
        break

    for obj in objs:
      if is_mesh(obj):
        actors.append(
          create_vtk_mesh(obj, opacity=mesh_opacity)
        )
      elif is_skeleton(obj):
        actors.extend(
          create_vtk_skeleton(obj)
        )

  segids.sort()

  for i, bbx in enumerate(bboxes):
    color = BBOX_COLORS[i % len(BBOX_COLORS)]
    actors.append(
      create_vtk_bbox(bbx, color)
    )

  display_actors(segids, actors)

def display_actors(segids, actors):
  if len(actors) == 0:
    return

  try:
    import vtk
  except ImportError:
    print("The visualize viewer requires the OpenGL based vtk. Try: pip install vtk --upgrade")
    return

  renderer = vtk.vtkRenderer()
  renderer.SetBackground(0.0, 0.06274509803921569, 0.12941176470588237) # rich black

  render_window = vtk.vtkRenderWindow()
  render_window.AddRenderer(renderer)
  render_window.SetSize(2000, 1500)

  interactor = vtk.vtkRenderWindowInteractor()
  style = vtk.vtkInteractorStyleTrackballCamera()
  interactor.SetInteractorStyle(style)

  interactor.SetRenderWindow(render_window)

  for actor in actors:
    renderer.AddActor(actor)

  window_name = f"Mesh & Skeleton Viewer"
  if segids:
    segids = [ str(x) for x in segids ]
    window_name += f" ({','.join(segids)})"
  
  render_window.SetWindowName(window_name)
  
  render_window.Render()
  interactor.Start()

def create_vtk_skeleton(skel):
  import vtk.util.numpy_support

  actors = []

  if hasattr(skel, "components"):
    skels = skel.components()
  else:
    skels = [ skel ]

  for i, skel in enumerate(skels):
    points = vtk.vtkPoints()
    points.SetData(vtk.util.numpy_support.numpy_to_vtk(skel.vertices))

    lines = vtk.vtkCellArray()

    for edge in skel.edges:
      line = vtk.vtkLine()
      line.GetPointIds().SetId(0, edge[0])
      line.GetPointIds().SetId(1, edge[1])
      lines.InsertNextCell(line)
  
    polyline = vtk.vtkPolyData()
    polyline.SetPoints(points)
    polyline.SetLines(lines)

    mapper = vtk.vtkPolyDataMapper()
    mapper.SetInputData(polyline)
    
    actor = vtk.vtkActor()
    actor.SetMapper(mapper)
    actor.GetProperty().SetLineWidth(2)

    color = COLORS[i % len(COLORS)]
    actor.GetProperty().SetColor(*color)
    actors.append(actor)

  return actors

def create_vtk_mesh(mesh, opacity=1.0):
  import vtk
  from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray

  vertices = mesh.vertices
  faces = mesh.faces

  vtk_points = vtk.vtkPoints()
  vtk_points.SetData(numpy_to_vtk(vertices))
  
  polydata = vtk.vtkPolyData()
  polydata.SetPoints(vtk_points)
  
  vtk_faces = vtk.vtkCellArray()
  vtk_faces.SetCells(
    faces.shape[0], 
    numpy_to_vtkIdTypeArray(
      np.hstack([np.full((faces.shape[0], 1), 3), faces]).flatten()
    )
  )

  polydata.SetPolys(vtk_faces)
  
  mapper = vtk.vtkPolyDataMapper()
  mapper.SetInputData(polydata)

  actor = vtk.vtkActor()
  actor.SetMapper(mapper)

  actor.GetProperty().SetOpacity(opacity)

  return actor

def create_vtk_bbox(bbox, color=None):
  import vtk
  vtk_points = vtk.vtkPoints()
  
  minpt = bbox.minpt.clone()
  maxpt = bbox.maxpt.clone()

  corners = [
    minpt,
    [ maxpt[0], minpt[1], minpt[2] ],
    [ minpt[0], maxpt[1], minpt[2] ],
    [ minpt[0], minpt[1], maxpt[2] ],
    [ maxpt[0], maxpt[1], minpt[2] ],
    [ maxpt[0], minpt[1], maxpt[2] ],
    [ minpt[0], maxpt[1], maxpt[2] ],
    maxpt,
  ]

  for pt in corners:
    vtk_points.InsertNextPoint(np.asarray(pt))

  edges = [
    [0,1], [0,2], [0,3],
    [7,6], [7,5], [7,4],
    [6,2], [6,3],
    [3,5], [5,1],
    [2,4], [4,1],
  ]

  lines = vtk.vtkCellArray()

  for edge in edges:
    line = vtk.vtkLine()
    line.GetPointIds().SetId(0, edge[0])
    line.GetPointIds().SetId(1, edge[1])
    lines.InsertNextCell(line)

  poly_data = vtk.vtkPolyData()
  poly_data.SetPoints(vtk_points)
  poly_data.SetLines(lines)

  mapper = vtk.vtkPolyDataMapper()
  mapper.SetInputData(poly_data)

  if color is None:
    color = BBOX_COLORS[0]

  actor = vtk.vtkActor()
  actor.SetMapper(mapper)
  actor.GetProperty().SetColor(*color)
  actor.GetProperty().SetLineWidth(2)

  return actor

def create_vtk_point_cloud(ptc):
  import vtk
  from vtk.util.numpy_support import numpy_to_vtk

  colors = vtk.vtkNamedColors()
  bkg = map(lambda x: x / 255.0, [40, 40, 40, 255])
  colors.SetColor("BkgColor", *bkg)

  points = vtk.vtkPoints()
  vtk_points = numpy_to_vtk(ptc, deep=True)
  points.SetData(vtk_points)

  verts = vtk.vtkCellArray()
  n_points = ptc.shape[0]
  connectivity = np.vstack((np.ones(n_points, dtype=np.int64), np.arange(n_points, dtype=np.int64))).T.flatten()
  verts.SetCells(n_points, numpy_to_vtk(connectivity, deep=True, array_type=vtk.VTK_ID_TYPE))

  polydata = vtk.vtkPolyData()
  polydata.SetPoints(points)
  polydata.SetVerts(verts)

  mapper = vtk.vtkPolyDataMapper()
  mapper.SetInputData(polydata)

  cylinderActor = vtk.vtkActor()
  cylinderActor.SetMapper(mapper)
  cylinderActor.GetProperty().SetColor(colors.GetColor3d("Mint"))
  cylinderActor.RotateX(30.0)
  cylinderActor.RotateY(-45.0)

  return cylinderActor

