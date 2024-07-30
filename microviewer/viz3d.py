from typing import Sequence, Union, Any

from collections import defaultdict

import numpy as np

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

def toiter(obj, is_iter=False):
  if isinstance(obj, str) or isinstance(obj, dict):
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

# vtk code written with help of ChatGPT
def objects(
  objects:Sequence[Any],
):
  """
  Produce a 3D co-visualization of meshes and skeletons together.
  """
  objects = toiter(objects)

  pairs = defaultdict(list)

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





