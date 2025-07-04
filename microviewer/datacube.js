class MonoVolume {
  constructor (channel) {
    this.channel = channel;
    this.colors = this.createColors();
    this.assigned_colors = {};
    this.hover_id = null;

    this.cache = {
      valid: false,
      segid: null,
      axis: null,
      slice: null,
      pixels: null,
    };
  }

  get(x,y,z) {
    return this.channel.get(x,y,z);
  }

  loaded () {
    return this.channel.loaded;
  }

  progress () {
    return this.channel.progress;
  }

  initializeColorAssignments (cube) {
    this.assigned_colors = new Uint32Array(this.renumbering.length);
    this.shuffleColors();
  }

  shuffleColors () {
    let colors = this.colors; 
    const num_colors = colors.length;

    for (let segid in this.assigned_colors) {
      this.assigned_colors[segid] = colors[ 
        ((Math.random() * 1000) | 0) % num_colors
      ];
    }

    this.assigned_colors[0] = 0;
    this.cache.valid = false;
  }

  createColors (opacity=1) {
    let colors = [
      { r: 17, g: 47, b: 65 }, // forest green
      { r: 6, g: 133, b: 135 }, // leaf green
      { r: 79, g: 185, b: 159 }, // teal
      { r: 242, g: 177, b: 52 }, // gold
      { r: 237, g: 85, b: 59 }, // orange
      { r: 43, g: 54, b: 173 }, // purple
      { r: 171, g: 63, b: 162 }, // pink
    ];

    let arraycolors = new Uint32Array(colors.length);

    for (let i = 0; i < colors.length; i++) {
      arraycolors[i] = this.colorToUint32(colors[i], opacity);
    }

    return arraycolors;
  }

  colorToUint32(color, opacity) {
    if (color.a === undefined) {
      color.a = 1;
    }

    if (this.channel.isLittleEndian()) {
      return (
        (255 * color.a * opacity) << 24 // a is 0 to 1
        | color.b << 16
        | color.g << 8
        | color.r << 0
      );
    }
    
    return (
      (255 * color.a * opacity) << 0
      | color.b << 8
      | color.g << 16
      | color.r << 24
    );
  }
  
  load (url, progressfn) {
    let _this = this;

    return binary_get(url, function (progress) {
      _this.channel.progress = progress;
    })
    .then(function (array_buffer) {
      let ArrayType = _this.channel.arrayType();
      _this.channel.cube = new ArrayType(array_buffer);
      _this.channel.loaded = true;
      _this.channel.progress = 1;
      _this.channel.normalized = false;
      _this.cache.valid = false;

      return _this.channel;
    });
  }

  render (ctx, axis, slice) {
    if (this.channel.bytes <= 2) {
      return this.renderChannelSlice(ctx, axis, slice);
    }

    return this.renderImageSlice(ctx, axis, slice);
  }

  /* renderChannelSlice
   *
   * PERFORMANCE SENSITIVE
   *
   * Render the channel image to the given canvas context.
   * Advantage over direct data cube access is the use of a
   * background loading image.
   *
   * Required:
   *   [0] ctx
   *   [1] axis: 'x', 'y', or 'z'
   *   [2] slice: 0 - 255
   *
   * Return: segid, w/ side effect of drawing on ctx
   */
  renderChannelSlice (ctx, axis, slice) {
    let _this = this;
    this.channel.renderGrayImageSlice(ctx, axis, slice);
    return this;
  }

  renderImageSlice (ctx, axis, slice) {
    this.channel.renderImageSlice(ctx, axis, slice);
    return this;
  }
}

// Represents a segmentation volume alone
class SegmentationVolume extends MonoVolume {
  constructor (datacube) {
    super(datacube);
    this.segments = {};
    this.renumbering = new datacube.cube.constructor(1);
    this.inverse_renumbering = {};
    this.has_segmentation = true;
    this.hover_id = null;
    this.show_unselected = false;
    this.max_label = 0;
  }

  selected () {
    let _this = this;
    return Object.keys(_this.segments)
      .filter( (segid) => _this.segments[segid] )
      .map( (segid) => _this.renumbering[segid] );
  }

  getInvertedSelection () {
    let _this = this;
    let new_selection = {};
    for (let i = _this.renumbering.length - 1; i >= 0; i--) {
      let segid = _this.renumbering[i];
      if (segid === 0) {
        continue;
      }
      else if (!_this.segments[i]) {
        new_selection[i] = true;
      }
    }
    return new_selection;
  }

  invertSelection () {
    this.segments = this.getInvertedSelection();
  }

  get(x,y,z) {
    return this.renumbering[this.channel.get(x,y,z)];
  }

  getSegmentation () {
    return this.channel;
  }

  clearSelected () {
    this.segments = {};
  }

  load (url, progressfn) {
    const _this = this;
    return super.load(url, progressfn)
      .then(function () { 
        [ _this.renumbering, _this.max_label ] = renumber(_this.channel.cube);
        _this.initializeColorAssignments(_this.channel.cube);

        for (const [key, value] of Object.entries(_this.renumbering)) {
          _this.inverse_renumbering[value] = key;
        }
        _this.inverse_renumbering[0] = 0;
      });
  }

  render(ctx, axis, slice) {
    let _this = this;

    const hover_id = this.hover_id;
    const cache = this.cache;

    const size = this.getSegmentation().faceDimensions(axis);
    const hover_enabled = (size[0] * size[1]) < 1024 * 1024 * 2;

    if (cache.valid
      && cache.pixels
      && cache.axis === axis 
      && cache.slice === slice
      && (!hover_enabled || (cache.segid === hover_id))) {

      ctx.putImageData(cache.pixels, 0, 0);
      return;
    }

    let seg_slice = this.getSegmentation().slice(axis, slice, /*copy=*/false);

    let pixels = ctx.getImageData(0, 0, size[0], size[1]);
    let pixels32 = new Uint32Array(pixels.data.buffer);

    const color_assignments = this.assigned_colors;
    const brightener = this.colorToUint32({ r: 10, g: 10, b: 10, a: 0 });
    const white = this.colorToUint32({ r: 200, g: 200, b: 200 }, 1);

    let segments = this.segments;
    let show_all = true;
    const show_unselected = this.show_unselected;

    let ArrayType = this.getSegmentation().arrayType();
    let segarray = new Uint8Array(this.renumbering.length);
    Object.keys(segments).forEach((label) => {
      segarray[label] = !!segments[label];
      show_all &&= !segments[label];
    });

    // We sometimes disable the hover highlight to get more performance
    if (hover_enabled) { 
      if (show_unselected) {
        for (let i = pixels32.length - 1; i >= 0; i--) {
          if (seg_slice[i]) {
            if (segarray[seg_slice[i]]) {
              pixels32[i] = white;
            }
            else {
              pixels32[i] = color_assignments[seg_slice[i]];
            }
            pixels32[i] += (seg_slice[i] === hover_id) * brightener;
          }
        }
      }
      else {
        for (let i = pixels32.length - 1; i >= 0; i--) {
          if (seg_slice[i]) {
            if (show_all | segarray[seg_slice[i]] | seg_slice[i] === hover_id) {
              pixels32[i] = color_assignments[seg_slice[i]];
              pixels32[i] += (seg_slice[i] === hover_id) * brightener;
            }
          }
        }
      }
    }
    else { 
      for (let i = pixels32.length - 1; i >= 0; i--) {
        if (seg_slice[i] && (show_all | segments[seg_slice[i]])) {
          pixels32[i] = color_assignments[seg_slice[i]];
        }
      }      
    }

    ctx.putImageData(pixels, 0, 0);

    cache.axis = axis;
    cache.slice = slice;
    cache.segid = hover_id;
    cache.pixels = pixels;
    cache.valid = true;

    return this;
  }

  /* toggleSegment
   *
   * Given an axis, slice index, and normalized x and y cursor coordinates
   * ([0, 1]), 0,0 being the top left, select the segment under the mouse.
   *
   * Required:
   *   [0] axis: 'x', 'y', or 'z'
   *   [1] slice: 0 - 255
   *   [2] normx: 0...1
   *   [3] normy: 0...1
   *
   * Return: segid
   */
  toggleSegment (axis, slice, normx, normy) {
    let _this = this;
    let x,y,z;

    let sizex = _this.getSegmentation().size.x,
      sizey = _this.getSegmentation().size.y,
      sizez = _this.getSegmentation().size.z;

    if (axis === 'x') {
      x = slice,
      y = normx * sizey,
      z = normy * sizez;
    }
    else if (axis === 'y') {
      x = normx * sizex,
      y = slice,
      z = normy * sizez;
    }
    else if (axis === 'z') {
      x = normx * sizex,
      y = normy * sizey,
      z = slice;
    }

    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);

    let segid = _this.getSegmentation().get(x, y, z);
    
    if (segid > 0) {
      _this.segments[segid] = !_this.segments[segid];
    }

    return segid;
  }

  selectSegment(segid) {
    let _this = this;
    segid = _this.getSegmentation().cast(segid);
    segid = _this.renumbering.indexOf(segid);
    if (segid !== -1) {
      _this.segments[segid] = true;
    }
  }

  /* getSegsInCircle
   *
   * Get the segids located within a circle. All
   * parameters are normalized between [0, 1]
   *
   * Required:
   *   d: 0..1, Diameter of the circle
   *   cx: 0..1, X coordinate of circle center
   *   cy: 0..1, Y coordinate of circle center
   *
   * Return: [ segids ]
   */
  getSegsInCircle (axis, slice, dx, dy, cx, cy) {
    let _this = this;
    let [ width, height ] = _this.getSegmentation().faceDimensions(axis);

    // Nullify anything outside the ellipse. Just like a GRE problem.

    let buffer = _this.getSegmentation().slice(axis, slice, /*copy=*/false);

    cx = Math.floor(cx * width) + 0.5;
    cy = Math.floor(cy * height) + 0.5;

    dx *= width;
    dy *= height;

    let rx = dx / 2,
      rx2 = dx * dx / 4,
      ry = dy / 2,
      ry2 = dy * dy / 4;

    let x0 = Math.max(0, Math.trunc(cx - rx) + 0.5),
      xf = Math.min(width, Math.trunc(cx + rx) + 0.5),
      y0 = Math.max(0, Math.trunc(cy - ry) + 0.5),
      yf = Math.min(height, Math.trunc(cy + ry) + 0.5);

    const ZERO = _this.getSegmentation().cast(0); 
    let segid = ZERO,
      bounds_test = 0.0;

    let segids = {};

    // For anisotropic data, we need to distort our circle (UI) into an ellipse 
    // since we've distorted the data to be square.
    // eqn of an ellipse: ((x - h)^2 / rx^2) + ((y - k)^2 / ry^2) <= 1
    // We'll use < instead of <= though to exclude the boundary

    for (var x = x0; x <= xf; x++) {
      for (var y = y0; y <= yf; y++) {
        bounds_test = ((x - cx) * (x - cx) / rx2) + ((y - cy) * (y - cy) / ry2);
        if (bounds_test < 1) {
          segid = buffer[(x|0) + width * (y|0)] | ZERO;
          segids[segid] = true;
        }
      }
    }

    delete segids[0];

    return Object.keys(segids).map( (segid) => parseInt(segid, 10) );
  }

  selectSegsInCircle(axis, slice, dx, dy, cx, cy) {
    let _this = this;
    let segs = _this.getSegsInCircle(axis, slice, dx, dy, cx, cy);
    segs.forEach((segid) => {
      _this.segments[segid] = true;
    });
  }

  eraseSegsInCircle(axis, slice, dx, dy, cx, cy) {
    let _this = this;
    let segs = _this.getSegsInCircle(axis, slice, dx, dy, cx, cy);
    segs.forEach((segid) => {
      _this.segments[segid] = false;
    });
  }

  paintCircle(axis, slice, dx, dy, cx, cy, label) {
    let _this = this;
    let [ width, height ] = _this.getSegmentation().faceDimensions(axis);

    label = _this.getSegmentation().cast(label);

    if (_this.inverse_renumbering[label] === undefined) {
      _this.renumbering[_this.max_label] = label;
      _this.inverse_renumbering[label] = _this.max_label;
      _this.assigned_colors[_this.max_label] = _this.colorToUint32({r:0,g:230,b:0}, 1);
      _this.max_label++;
    }
    label = _this.inverse_renumbering[label];
    _this.segments[label] = true;

    cx = Math.floor(cx * width) + 0.5;
    cy = Math.floor(cy * height) + 0.5;

    dx *= width;
    dy *= height;

    let rx = dx / 2,
      rx2 = dx * dx / 4,
      ry = dy / 2,
      ry2 = dy * dy / 4;

    let x0 = Math.max(0, Math.trunc(cx - rx) + 0.5),
      xf = Math.min(width, Math.trunc(cx + rx) + 0.5),
      y0 = Math.max(0, Math.trunc(cy - ry) + 0.5),
      yf = Math.min(height, Math.trunc(cy + ry) + 0.5);

    let segid = _this.getSegmentation().cast(0),
      bounds_test = 0.0;

    // For anisotropic data, we need to distort our circle (UI) into an ellipse 
    // since we've distorted the data to be square.
    // eqn of an ellipse: ((x - h)^2 / rx^2) + ((y - k)^2 / ry^2) <= 1
    // We'll use < instead of <= though to exclude the boundary
    let cube = _this.getSegmentation().cube;
    const sx = _this.getSegmentation().size.x;
    const sy = _this.getSegmentation().size.y;

    if (axis == 'z') {
      for (var y = y0; y <= yf; y++) {
        for (var x = x0; x <= xf; x++) {
          bounds_test = ((x - cx) * (x - cx) / rx2) + ((y - cy) * (y - cy) / ry2);
          if (bounds_test < 1) {
            cube[(x|0) + sx * ((y|0) + sy * (slice|0))] = label;
          }
        }
      }
    }
    else if (axis == 'y') {
      for (var z = y0; z <= yf; z++) {
        for (var x = x0; x <= xf; x++) {
          bounds_test = ((x - cx) * (x - cx) / rx2) + ((z - cy) * (z - cy) / ry2);
          if (bounds_test < 1) {
            cube[(x|0) + sx * ((slice|0) + sy * (z|0))] = label;
          }
        }
      }
    }
    else if (axis === 'x') {
      for (var z = y0; z <= yf; z++) {
        for (var y = x0; y <= xf; y++) {
          bounds_test = ((y - cx) * (y - cx) / rx2) + ((z - cy) * (z - cy) / ry2);
          if (bounds_test < 1) {
            cube[(slice|0) + sx * ((y|0) + sy * (z|0))] = label;
          }
        }
      }
    }
    else {
      throw new Error("Unsupported axis.")
    }
  }

  destructivelyMergeSelection () {
    let segments = this.segments;
    let segarray = new Uint8Array(this.renumbering.length);
    let min_label = 9999999999;
    Object.keys(segments).forEach((label) => {
      let label_i = parseInt(label);
      segarray[label_i] = !!segments[label];
      if (label_i < min_label) {
        min_label = label_i;
      }
    });

    let cube = this.getSegmentation().cube;
    for (let i = cube.length - 1; i >= 0; i--) {
      if (segarray[cube[i]]) {
        cube[i] = min_label;
      }
    }

    for (let i = 0; i < segarray.length; i++) {
      if (segarray[i]) {
        delete segments[`${i}`];
      }
    }
    segments[`${min_label}`] = true;
  }

  destructivelyEraseSelection () {
    let segments = this.segments;
    let segarray = new Uint8Array(this.renumbering.length);
    Object.keys(segments).forEach((label) => {
      segarray[label] = !!segments[label];
      segments[label] = false;
    });
    let cube = this.getSegmentation().cube;

    for (let i = cube.length - 1; i >= 0; i--) {
      if (segarray[cube[i]]) {
        cube[i] = 0;
      }
    }
  }
}

/* HyperVolume
 *
 * Represents a 3D bounding box in the data set's global coordinate space.
 * Contains two types of images: channel (raw EM images), 
 * and segmentation (AI determined supervoxels)
 *
 * Required:
 *   channel: A blankable Datacube representing the channel values. 
 *        Since they're grayscale, an efficient representation is 1 byte
 *   segmentation: A blankable Datacube representing segmentation values.
 *      Seg ids don't appear to rise above the high thousands, so 2 bytes is probably sufficent.
 *
 * Return: HyperVolume object
 */
class HyperVolume extends SegmentationVolume {
  constructor (channel, segmentation) {
    super(segmentation);
    this.channel = channel; // a data cube
    this.segmentation = segmentation; // a segmentation cube

    this.renumbering = new segmentation.cube.constructor(1);
    this.inverse_renumbering = {};
    this.has_segmentation = true;
    this.max_label = 0;

    this.show_unselected = false;
    this.max_label = 0;

    this.segments = {};
    this.alpha = 0.5;
    this.hide_channel = false;
    this.hide_segmentation = false;
  }

  get(x,y,z) {
    return [
      this.channel.get(x,y,z),
      this.renumbering[this.segmentation.get(x,y,z)],
     ]
  }

  getSegmentation () {
    return this.segmentation;
  }

  loaded () {
    return this.channel.loaded && this.segmentation.loaded;
  }

  progress () {
    let chan = this.channel;
    let seg = this.segmentation;
    return (chan.bytes * chan.progress + seg.bytes * seg.progress) / (chan.bytes + seg.bytes);
  }

  /* load
   *
   * Download the channel and segmentation and materialize them into
   * their respective datacubes.
   *
   * Return: promise representing download completion state
   */
  load (progressfn) {
    let _this = this;

    let channel_promise = binary_get('/channel', function (ratio) {
        _this.channel.progress = ratio;
        progressfn(ratio);
      })
      .then(function (array_buffer) {
        let ArrayType = _this.channel.arrayType();
        _this.channel.cube = new ArrayType(array_buffer);
        _this.channel.loaded = true;
        _this.channel.progress = 1;
        _this.channel.normalized = false;
        _this.cache.valid = false;

        return _this.channel;
      });

    let seg_promise = binary_get('/segmentation', function (ratio) {
        _this.segmentation.progress = ratio;
        progressfn(ratio);
      })      
      .then(function (array_buffer) {
        let ArrayType = _this.segmentation.arrayType();
        _this.segmentation.cube = new ArrayType(array_buffer);
        _this.segmentation.loaded = true;
        _this.segmentation.progress = 1;
        _this.segmentation.normalized = false;
        _this.cache.valid = false;

        [ _this.renumbering, _this.max_label ] = renumber(_this.segmentation.cube);
        _this.initializeColorAssignments(_this.segmentation.cube);

        for (const [key, value] of Object.entries(_this.renumbering)) {
          _this.inverse_renumbering[value] = key;
        }
        _this.inverse_renumbering[0] = 0;

        return _this.segmentation;
      });

    return Promise.all([ channel_promise, seg_promise ]);
  }

  /* renderChannelSlice
   *
   * Render the channel image to the given canvas context.
   * Advantage over direct data cube access is the use of a
   * background loading image.
   *
   * Required:
   *   [0] ctx
   *   [1] axis: 'x', 'y', or 'z'
   *   [2] slice: 0 - 255
   *
   * Return: segid, w/ side effect of drawing on ctx
   */
  render (ctx, axis, slice) {
    let _this = this;

    let pixels;
    let alpha = this.alpha;
    let ialpha = 1 - alpha;

    if (!_this.hide_channel) {
      pixels = _this.channel.grayImageSlice(axis, slice, /*transparency=*/false, /*copy=*/false);
      ctx.putImageData(pixels, 0, 0);
    }
    else {
      let sizes = _this.channel.faceDimensions(axis);
      pixels = _this.channel.canvas_context.createImageData(sizes[0], sizes[1]);
      alpha = 1;
      ialpha = 0;
    }

    if (_this.hide_segmentation) {
      return;
    }

    let pixels32 = new Uint32Array(pixels.data.buffer); // creates a view, not an array
    let segmentation = _this.segmentation.slice(axis, slice, /*copy=*/false);

    let x, y, segid;

    const color_assignments = this.assigned_colors;

    let masks = _this.segmentation.getRenderMaskSet();
    masks = Uint32Array.of(masks.r, masks.g, masks.b);
    const brightener = this.colorToUint32({ r: 10, g: 10, b: 10, a: 0 });
    const white = this.colorToUint32({ r: 200, g: 200, b: 200 }, 1);
    const hover_id = this.hover_id;

    let segments = this.segments;
    let show_all = true;
    const show_unselected = this.show_unselected;
    let selected_segments = new Uint8Array(this.renumbering.length);
    Object.keys(segments).forEach((label) => {
      selected_segments[label] = !!segments[label];
      show_all &&= !segments[label];
    });

    let pxdata = pixels.data;

    let hover = false;
    let i4;
    let color = 0;

    if (alpha > 0 && alpha < 1) {
      if (show_unselected) {
        for (let i = pixels32.length - 1; i >= 0; i--) {
          segid = segmentation[i];
          if (segid === 0) {
            continue;
          }
          hover = (segid === hover_id);
          i4 = i << 2;
          if (selected_segments[segid]) {
            color = white;
          }
          else {
            color = color_assignments[segid];
          }
          pxdata[i4] = ((pxdata[i4] * ialpha) + ((color & masks[0]) * alpha)) | 0;
          pxdata[i4 + 1] = ((pxdata[i4 + 1] * ialpha) + (((color & masks[1]) >>> 8) * alpha)) | 0;
          pxdata[i4 + 2] = ((pxdata[i4 + 2] * ialpha) + (((color & masks[2]) >>> 16) * alpha)) | 0;
          pixels32[i] += hover * brightener;
        }
      }
      else {
        for (let i = pixels32.length - 1; i >= 0; i--) {
          segid = segmentation[i];
          if (segid === 0) {
            continue;
          }
          hover = (segid === hover_id);
          i4 = i << 2;
          if (show_all | selected_segments[segid] | hover) {
            pxdata[i4] = ((pxdata[i4] * ialpha) + ((color_assignments[segid] & masks[0]) * alpha)) | 0;
            pxdata[i4 + 1] = ((pxdata[i4 + 1] * ialpha) + (((color_assignments[segid] & masks[1]) >>> 8) * alpha)) | 0;
            pxdata[i4 + 2] = ((pxdata[i4 + 2] * ialpha) + (((color_assignments[segid] & masks[2]) >>> 16) * alpha)) | 0;
            pixels32[i] += hover * brightener;
          }
        }
      }
    }
    else if (alpha === 1) {
      show_all = show_all || show_unselected;
      for (let i = pixels32.length - 1; i >= 0; i--) {
        segid = segmentation[i];
        if (segid === 0) {
          continue;
        }
        hover = (segid === hover_id);
        color = color_assignments[segid];
        if (show_unselected & selected_segments[segid]) {
          color = white;
        }
        if (hover) {
          pixels32[i] = color + brightener;
        }
        else if (selected_segments[segid] | show_all) {
          pixels32[i] = color;
        }
      }
    }

    ctx.putImageData(pixels, 0, 0);

    return this;
  }
}

class CachedImageData {
  constructor (context) {
    this.context = context;
    this.cache = null;
  }

  getImageData(width, height) {
    if (!this.cache || this.cache.width !== width || this.cache.height !== height) {
        this.cache = this.context.createImageData(width, height);
    }

    return this.cache;
  }
}


/* DataCube
 *
 * Efficiently represents a 3D image as a 1D array of integer values.
 *
 * Can be configured to use 8, 16, 32, or 64 bit integers.
 *
 * Required:
 *  bytes: (int) 1, 2, 4, or 8 specifies 8, 16, 32, or 64 bit representation
 *  
 * Optional:
 *  size: { x: (int) pixels, y: (int) pixels, z: pixels}, default 256^3
 *
 * Return: self
 */
class DataCube {
  constructor (args) {
    this.bytes = args.bytes || 1;
    this.size = args.size || { x: 256, y: 256, z: 256 };
    this.cube = this.materialize();

    this.canvas_context = this.createImageContext();
    this.cached_imgdata = new CachedImageData(this.canvas_context);

    this.clean = true;
    this.loaded = false;
    this.progress = 0;

    this.faces = {
      x: [ 'y', 'z' ],
      y: [ 'x', 'z' ],
      z: [ 'x', 'y' ],
    };
  }

  cast (num) {
    return (this.cube instanceof BigUint64Array)
      ? BigInt(num)
      : Number(num);
  }

  faceDimensions (axis) {
    let face = this.faces[axis];
    return [
      this.size[face[0]],
      this.size[face[1]]
    ];
  }

  numpyHeader () {
    const dtype = `<u${this.bytes}`;
    const shape = `${this.size.x},${this.size.y},${this.size.z}`;
    const header = `{"descr": "${dtype}", "fortran_order": True, "shape": (${shape}), }`;
    const encoder = new TextEncoder();
    const headerBytes = encoder.encode(header);

    // \x93NUMPY\x01\x00
    const magic = [0x93, 0x4E, 0x55, 0x4D, 0x50, 0x59, 0x01, 0x00]; 
    let headerLength = headerBytes.length + 10; 

    // align to 64 bytes and fill with spaces 0x20
    headerLength = Math.ceil(headerLength / 64) * 64;

    const combinedBytes = new Uint8Array(headerLength);
    combinedBytes.fill(0x20);
    combinedBytes.set(magic, 0);
    combinedBytes[8] = headerLength - 10;
    combinedBytes[9] = 0;
    combinedBytes.set(headerBytes, 10);
    combinedBytes[headerLength - 1] = 10;
    return combinedBytes;
  }

  saveNumpy (filename) {
    const npyHeader = this.numpyHeader();
    // Create a combined array of header and data bytes
    const combinedBytes = new Uint8Array(npyHeader.length + this.cube.byteLength);
    const cubeview = new Uint8Array(this.cube.buffer, 0, this.cube.byteLength);
    combinedBytes.set(npyHeader, 0);
    combinedBytes.set(cubeview, npyHeader.length);
    this.save(filename, combinedBytes);
  }

  async saveCrackle(filename) {
    const cubeview = new Uint8Array(this.cube.buffer, 0, this.cube.byteLength);
    const buffer = await compressCrackle(
      cubeview, this.bytes,
      this.size.x, this.size.y, this.size.z,
    );
    this.save(filename, buffer);
  }

  save (filename, buffer) {
    const blob = new Blob([ buffer.buffer ]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // for internal use, makes a canvas for blitting images to
  createImageContext () {
    let canvas = document.createElement('canvas');
    canvas.width = this.size.x;
    canvas.height = this.size.y;

    return canvas.getContext('2d'); // used for accelerating XY plane image insertions
  }

  // for internal use, creates the data cube of the correct data type and size
  materialize () {
    let ArrayType = this.arrayType();

    let size = this.size;

    return new ArrayType(size.x * size.y * size.z);
  }

  /* clear
   *
   * Zero out the cube and reset clean and loaded flags.
   *
   * Required: None
   *   
   * Return: this
   */
  clear () {
    this.cube.fill(0);
    this.clean = true;
    this.loaded = false;

    return this;
  }

  /* insertSquare
   *
   * Insert an XY aligned plane of data into the cube. 
   *
   * If the square extends outside the bounds of the cube, it is 
   * partially copied where it overlaps.
   *
   * Required:
   *   [0] square: A 1D array representing a 2D plane. 
   *   [1] width
   *
   * Optional:
   *   [3,4,5] x,y,z offsets into the cube for partial slice downloads  
   *
   * Return: this
   */
  insertSquare (
    square, axis, slice
  ) {
    let _this = this;

    const sx = _this.size.x,
      sy = _this.size.y,
      sz = _this.size.z;

    let cube = _this.cube;
    let ArrayType = this.arrayType();
    let sq = new ArrayType(square.buffer);

    if (axis === 'z') {
      cube.set(sq, sx * sy * slice);
    }
    else if (axis === 'y') {
      let i = 0;
      for (let z = 0; z < sz; z++) {
        // cube.set(sq, z * sx, sx);
        for (let x = 0; x < sx; x++, i++) {
          cube[x + sx * (slice + sy * z)] = sq[i];
        }
      }
    }
    else if (axis === 'x') {
      let i = 0;
      for (let z = 0; z < sz; z++) {
        for (let y = 0; y < sy; y++, i++) {
          cube[slice + sx * (y + sy * z)] = sq[i];
        }
      }
    }

    _this.clean = false;

    return this;
  }

  /* insertCanvas
   *
   * Like insert square, but uses a canvas filled with an image instead.
   *
   * Required:
   *   [0] canvas
   *
   * Optional:
   *   [1,2,3] x,y,z offsets into the cube for partial downloads
   *
   * Return: this
   */
  insertCanvas (canvas, offsetx = 0, offsety = 0, offsetz = 0) {
    let ctx = canvas.getContext('2d');
    let imgdata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return this.insertImageData(imgdata, canvas.width, offsetx, offsety, offsetz);
  }

  /* insertImage
   *
   * Like insert square, but uses an image object instead.
   *
   * Required:
   *   [0] image
   *
   * Optional:
   *   [1,2,3] x,y,z offsets into the cube for partial downloads
   *
   * Return: this
   */
  insertImage (img, offsetx = 0, offsety = 0, offsetz = 0) {
    this.canvas_context.drawImage(img, 0, 0);
    let imgdata = this.canvas_context.getImageData(0, 0, img.width, img.height);
    return this.insertImageData(imgdata, img.width, offsetx, offsety, offsetz);
  }

  /* insertImageData
   *
   * Decodes a Uint8ClampedArray ImageData ([ R, G, B, A, .... ]) buffer
   * into interger values and inserts them into the data cube.
   *
   * Required:
   *  [0] imgdata: An ImageData object (e.g. from canvas.getImageData)
   *  [1] width: width of the image in pixels, 
   *    the height can be inferred from array length given this
   *  [2,3,4] offsets of x,y,z for partial data
   *
   * Return: this
   */
  insertImageData (imgdata, width, offsetx, offsety, offsetz) {
    let _this = this;

    let pixels = imgdata.data; // Uint8ClampedArray

    // This viewing of the Uint8 as a Uint32 allows for 
    // a memory stride of 4x larger, making reading and writing cheaper
    // as RAM is the slow thing here.
    let data32 = new Uint32Array(pixels.buffer); // creates a view, not an array

    // Note: on little endian machine, data32 is 0xaabbggrr, so it's already flipped
    // from the Uint8 RGBA

    let masks = {
      true: {
        1: 0x000000ff,
        2: 0x0000ffff,
        4: 0xffffffff,
      },
      false: {
        1: 0xff000000,
        2: 0xffff0000,
        4: 0xffffffff,        
      },
    };

    const mask = masks[this.isLittleEndian()][this.bytes];
    
    let x = 0, y = 0;
    
    const sizex = _this.size.x | 0,
        zadj = (offsetz * _this.size.x * _this.size.y) | 0;
    
    for (y = width - 1; y >= 0; y--) {
      for (x = width - 1; x >= 0; x--) {
      
        _this.cube[
          (offsetx + x) + sizex * (offsety + y) + zadj
        ] = data32[ x + y * width ] & mask;
      }
    }

    _this.clean = false;

    return this;
  }

  /* get
   *
   * Retrieve a particular index from the data cube.
   *
   * Not very efficient, but useful for some purposes. It's convenient
   * to use this method rather than remember how to access the 3rd dimension
   * in a 1D array.
   *
   * Required:
   *   [0] x
   *   [1] y
   *   [2] z
   *
   * Return: value
   */
  get (x, y, z) {
    return this.cube[x + this.size.x * (y + this.size.y * z)];
  }

  /* slice
   * 
   * Return a 2D slice of the data cube as a 1D array 
   * of the same type.
   * 
   * x axis gets a yz plane, y gets xz, and z gets xy.
   *
   * z slicing is accelerated compared to the other two.
   *
   * Required:
   *   axis: x, y, or z
   *   index: 0 to size - 1 on that axis
   * 
   * Optional:
   *   [2] copy - allocates new memory if true, otherwise returns a view on the underlying arraybuffer
   *
   * Return: 1d array
   */
  slice (axis, index, copy = true) {
    let _this = this;

    if (index < 0 || index >= this.size[axis]) {
      throw new Error(index + ' is out of bounds.');
    }

    const xsize = _this.size.x,
      ysize = _this.size.y,
      zsize = _this.size.z;

    const xysize = xsize * ysize;

    let face = this.faces[axis];
    let ArrayType = this.arrayType();

    if (axis === 'z') {
      let byteoffset = index * xysize * this.bytes;

      if (copy) {
        let buf = _this.cube.buffer.slice(byteoffset, byteoffset + xysize * this.bytes);
        return new ArrayType(buf);
      } 
      else {
        return new ArrayType(_this.cube.buffer, byteoffset, xysize);
      }
    }

    let square = new ArrayType(this.size[face[0]] * this.size[face[1]]);

    // Note: order of loops is important for efficient memory access
    // and correct orientation of images. Consecutive x access is most efficient.

    let i = square.length - 1;
    if (axis === 'x') {
      for (let z = zsize - 1; z >= 0; --z) {
        for (let y = ysize - 1; y >= 0; --y) {
          square[i] = _this.cube[index + xsize * y + xysize * z];
          --i;
        }
      }
    }
    else if (axis === 'y') {
      // possible to make this more efficient with an array memcpy
      // as 256 x are consecutive, but no memcpy in browser.
      const yoffset = xsize * index;
      for (let z = zsize - 1; z >= 0; --z) {
        for (let x = xsize - 1; x >= 0; --x) { 
          square[i] = _this.cube[x + yoffset + xysize * z];
          --i;
        }
      }
    }

    return square;
  }

  /* imageSlice
   *
   * Generate an ImageData object that encodes a color 
   * representation of an on-axis 2D slice of the data cube.
   *
   * Required:
   *   [0] axis: 'x', 'y', or 'z'
   *   [1] index: 0 - axis size - 1
   *
   * Return: imagedata
   */
  imageSlice (axis, index, copy=true) {
    let _this = this;

    let square = this.slice(axis, index, /*copy=*/false);
    let sizes = this.faceDimensions(axis);

    // see https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
    let imgdata = copy
      ? this.canvas_context.createImageData(sizes[0], sizes[1])
      : this.cached_imgdata.getImageData(sizes[0], sizes[1]);

    let maskset = this.getRenderMaskSet();
    const alphamask = maskset.a;

    // if we break this for loop up by bytes, we can extract extra performance.
    // If we want to handle transparency efficiently, you'll want to break out the
    // 32 bit case so you can avoid an if statement.

    // you can also avoid doing the assignment for index 1 and 2 for 8 bit, and 2 for 16 bit
    // This code seemed more elegant to me though, so I won't prematurely optimize.

    let data = imgdata.data;
    let data32 = new Uint32Array(data.buffer);

    if (this.bytes < 4) {
      for (let i = square.length - 1; i >= 0; i--) {
        data32[i] = square[i] | alphamask; 
      }
    }
    else {
      for (let i = square.length - 1; i >= 0; i--) {
        data32[i] = square[i]; 
      }
    }

    return imgdata;
  }

  /* grayImageSlice
   *
   * Generate an ImageData object that encodes a grayscale 
   * representation of an on-axis 2D slice of the data cube.
   *
   * Required:
   *   [0] axis: 'x', 'y', or 'z'
   *   [1] index: 0 - axis size - 1
   * Optional:
   *   [2] transparency - black pixels are transparent
   *   [3] copy - whether to allocate new memory (true) or reuse a shared cache for this function (false)
   *
   * Return: imagedata
   */
  grayImageSlice (axis, index, transparency=false, copy=true) {
    let _this = this;

    let square = this.slice(axis, index, /*copy=*/false);

    let sizes = this.faceDimensions(axis);

    let imgdata = copy
      ? this.canvas_context.createImageData(sizes[0], sizes[1])
      : this.cached_imgdata.getImageData(sizes[0], sizes[1]);

    let data32 = new Uint32Array(imgdata.data.buffer);

    const alpha = this.isLittleEndian() 
      ? 0xff000000
      : 0x000000ff;

    let i = 0;

    if (transparency) {
      for (i = square.length - 1; i >= 0; i--) {
        data32[i] = (square[i] | square[i] << 8 | square[i] << 16 | (square[i] && alpha));
      }
    }
    else {
      for (i = square.length - 1; i >= 0; i--) {
        data32[i] = (square[i] | square[i] << 8 | square[i] << 16 | alpha);
      }
    }

    return imgdata;
  }

  /* renderImageSlice
   *
   * Render a 2D slice of the data cube to a provided 
   * canvas context full vibrant color.
   *
   * Required:
   *  [0] context
   *  [1] axis: 'x', 'y', or 'z'
   *  [2] index: 0 to axis size - 1
   *   
   * Return: this
   */
  renderImageSlice (context, axis, index) {
    var imgdata = this.imageSlice(axis, index, false);
    context.putImageData(imgdata, 0, 0);
    return this;
  }

  /* renderGrayImageSlice
   *
   * Render a 2D slice of the data cube to a provided 
   * canvas context in grayscale.
   *
   * Required:
   *  [0] context
   *  [1] axis: 'x', 'y', or 'z'
   *  [2] index: 0 to axis size - 1
   *   
   * Return: this
   */
  renderGrayImageSlice (context, axis, index) {
    var imgdata = this.grayImageSlice(axis, index, /*transparent=*/false, /*copy=*/false);
    context.putImageData(imgdata, 0, 0);
    return this;
  }

  // http://stackoverflow.com/questions/504030/javascript-endian-encoding
  isLittleEndian () {
    var arr32 = new Uint32Array(1);
    var arr8 = new Uint8Array(arr32.buffer);
    arr32[0] = 255;

    let islittle = (arr8[0] === 255);

    this.isLittleEndian = () => islittle;

    return islittle;
  }

  // For internal use, return the right bitmask for rgba image slicing
  // depending on CPU endianess.
  getRenderMaskSet () {
    let bitmasks = {
      true: { // little endian, most architectures
        r: 0x000000ff,
        g: 0x0000ff00,
        b: 0x00ff0000,
        a: 0xff000000,
      },
      false: { // big endian, mostly ARM and some specialized equipment
        r: 0xff000000,
        g: 0x00ff0000,
        b: 0x0000ff00,
        a: 0x000000ff,
      },
    };

    return bitmasks[this.isLittleEndian()];
  }

  /* arrayType
   *
   * Return the right type of data cube array 
   * depending on the bytes argument provided.
   *
   * Required: None
   *   
   * Return: one of Uint8Array, Uint16Array, or Uint32Array
   */
  arrayType () {
    let choices = {
      1: Uint8Array,
      2: Uint16Array,
      4: Uint32Array,
      8: BigUint64Array,
    };

    let ArrayType = choices[this.bytes];

    if (ArrayType === undefined) {
      throw new Error(this.bytes + ' is not a valid typed array byte count.');
    }

    return ArrayType;
  }
}

class Uint16DataCube extends DataCube {
  constructor (args) {
    super(args);
    this.minval = 65535;
    this.maxval = 0;
    this.normalized = false;
  }

  renormalize () {
    let _this = this;
    let minval = 65535;
    let maxval = 0;

    const cube = _this.cube;
    
    for (let i = cube.length - 1; i >= 0; i--) {
      if (cube[i] > maxval) {
        maxval = cube[i];
      }
      if (cube[i] < minval) {
        minval = cube[i];
      }
    }

    this.minval = minval;
    this.maxval = maxval;
    this.normalized = true;
  }

  /* grayImageSlice
   *
   * Generate an ImageData object that encodes a grayscale 
   * representation of an on-axis 2D slice of the data cube.
   *
   * Required:
   *   [0] axis: 'x', 'y', or 'z'
   *   [1] index: 0 - axis size - 1
   * Optional:
   *   [2] transparency - black pixels are transparent
   *   [3] copy - whether to allocate new memory (true) or reuse a shared cache for this function (false)
   *
   * Return: imagedata
   */
  grayImageSlice (axis, index, transparency=false, copy=true) {
    let _this = this;

    if (!this.normalized) {
      this.renormalize();
    }

    let square = this.slice(axis, index, /*copy=*/false);

    let sizes = this.faceDimensions(axis);

    let imgdata = copy
      ? this.canvas_context.createImageData(sizes[0], sizes[1])
      : this.cached_imgdata.getImageData(sizes[0], sizes[1]);

    if (this.minval === 0 && this.maxval === 65535) {
      return imgdata;
    }

    let data32 = new Uint32Array(imgdata.data.buffer);

    const alpha = this.isLittleEndian() 
      ? 0xff000000
      : 0x000000ff;

    let i = 0;
    let val = 0|0;
    const black = transparency ? 0x00000000 : alpha;

    if (this.minval === this.maxval) {
      val = (this.minval === 0) ? black : 0xffffffff;

      for (i = square.length - 1; i >= 0; i--) {
          data32[i] = val;
      } 
      return imgdata;
    }

    const norm = 65535.0 / (this.maxval - this.minval);
    const minval = (this.minval * norm)|0;

    for (i = square.length - 1; i >= 0; i--) {
      val = (square[i] * norm - minval) >> 8;
      data32[i] = (val | val << 8 | val << 16 | alpha);
    }

    return imgdata;
  }
}

class BooleanDataCube extends DataCube {
  constructor (args) {
    args.bytes = 1;
    super(args);
  }

  /* grayImageSlice
   *
   * Generate an ImageData object that encodes a grayscale 
   * representation of an on-axis 2D slice of the data cube.
   *
   * Required:
   *   [0] axis: 'x', 'y', or 'z'
   *   [1] index: 0 - axis size - 1
   * Optional:
   *   [2] transparency - black pixels are transparent
   *   [3] copy - whether to allocate new memory (true) or reuse a shared cache for this function (false)
   *
   * Return: imagedata
   */
  grayImageSlice (axis, index, transparency=false, copy=true) {
    let _this = this;

    let square = this.slice(axis, index, /*copy=*/false);
    let sizes = this.faceDimensions(axis);

    let imgdata = copy
      ? this.canvas_context.createImageData(sizes[0], sizes[1])
      : this.cached_imgdata.getImageData(sizes[0], sizes[1]);

    let data32 = new Uint32Array(imgdata.data.buffer);

    const alpha = this.isLittleEndian() 
      ? 0xff000000
      : 0x000000ff;

    let i = 0;
    let tmp = 0;

    if (transparency) {
      for (i = square.length - 1; i >= 0; i--) {
        tmp = 0x00 - square[i];
        data32[i] = (tmp | tmp << 8 | tmp << 16 | (tmp && alpha));
      }
    }
    else {
      for (i = square.length - 1; i >= 0; i--) {
        tmp = 0x00 - square[i];
        data32[i] = (tmp | tmp << 8 | tmp << 16 | alpha);
      }
    }

    return imgdata;
  }
}

class FloatingPointDataCube extends DataCube {
  constructor (args) {
    super(args);
    this.minval = -Infinity;
    this.maxval = +Infinity;

    this.finite = true;
    this.nan = false;
    this.normalized = false;
  }

  renormalize () {
    let _this = this;
    let minval = +Infinity;
    let maxval = -Infinity;

    const cube = _this.cube;
    
    for (let i = cube.length - 1; i >= 0; i--) {
      if (!isFinite(cube[i])) {
        this.finite = false;
        continue;
      }
      else if (isNaN(cube[i])) {
        this.nan = true;
        continue;
      }

      if (cube[i] > maxval) {
        maxval = cube[i];
      }
      if (cube[i] < minval) {
        minval = cube[i];
      }
    }

    this.minval = minval;
    this.maxval = maxval;
    this.normalized = true;
  }

  grayImageSlice (axis, index, transparency=false, copy=true) {
    return this.imageSlice(axis, index, transparency, copy);
  }

  /* imageSlice
   *
   * Generate an ImageData object that encodes a grayscale 
   * representation of an on-axis 2D slice of the data cube.
   *
   * Required:
   *   [0] axis: 'x', 'y', or 'z'
   *   [1] index: 0 - axis size - 1
   * Optional:
   *   [2] transparency - black pixels are transparent
   *   [3] copy - whether to allocate new memory (true) or reuse a shared cache for this function (false)
   *
   * Return: imagedata
   */
  imageSlice (axis, index, transparency=false, copy=true) {
    let _this = this;

    if (!this.normalized) {
      this.renormalize();
    }

    let square = this.slice(axis, index, /*copy=*/false);

    let sizes = this.faceDimensions(axis);

    let imgdata = copy
      ? this.canvas_context.createImageData(sizes[0], sizes[1])
      : this.cached_imgdata.getImageData(sizes[0], sizes[1]);

    let data32 = new Uint32Array(imgdata.data.buffer);

    const alpha = this.isLittleEndian() 
      ? 0xff000000
      : 0x000000ff;

    let i = 0;
    let val = 0|0;
    const black = transparency ? 0x00000000 : alpha;

    if (this.minval === this.maxval) {
      val = (this.minval === 0) ? black : 0xffffffff;

      for (i = square.length - 1; i >= 0; i--) {
        if (isNaN(square[i]) || square[i] === -Infinity) {
          data32[i] = black;
        }
        else {
          data32[i] = val;          
        }
      } 
      return imgdata;
    }

    const norm = 255.0 / (this.maxval - this.minval);
    const minval = this.minval * norm;

    if (transparency && this.finite && !this.nan) {
      for (i = square.length - 1; i >= 0; i--) {
        val = (square[i] * norm - minval) | 0;
        data32[i] = (val | val << 8 | val << 16 | (val && alpha));
      }
    }
    else if (this.finite && !this.nan) {
      for (i = square.length - 1; i >= 0; i--) {
        val = (square[i] * norm - minval) | 0;
        data32[i] = (val | val << 8 | val << 16 | alpha);
      }
    }
    else if (!this.finite && !this.nan) {
     for (i = square.length - 1; i >= 0; i--) {
        if (isFinite(square[i])) {
          val = (square[i] * norm - minval) | 0;
          data32[i] = (val | val << 8 | val << 16 | alpha);
        }
        else {
          data32[i] = (square[i] === +Infinity) 
            ? 0xffffffff 
            : alpha;
        }        
      } 
    }
    else if (this.finite && this.nan) {
     for (i = square.length - 1; i >= 0; i--) {
        if (isNaN(square[i])) {
          data32[i] = alpha;
        }
        else {
          val = (square[i] * norm - minval) | 0; 
          data32[i] = (val | val << 8 | val << 16 | alpha);        
        }
      } 
    }
    else if (!this.finite && this.nan) {
     for (i = square.length - 1; i >= 0; i--) {
        if (isNaN(square[i])) {
          data32[i] = alpha;
        }
        else if (isFinite(square[i])) {
          val = (square[i] * norm - minval) | 0; 
          data32[i] = (val | val << 8 | val << 16 | alpha);
        }
        else {
          data32[i] = (square[i] === +Infinity) 
            ? 0xffffffff 
            : alpha;
        }     
      }
    }

    return imgdata;
  }

  arrayType () {
    let choices = {
      4: Float32Array,
      8: Float64Array,
    };

    let ArrayType = choices[this.bytes];

    if (ArrayType === undefined) {
      throw new Error(this.bytes + ' is not a valid typed array byte count.');
    }

    return ArrayType;
  }
}

function binary_get (url, progressfn) {
  return new Promise(function (fufill, reject) {
    let req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.responseType = "arraybuffer";
    req.onprogress = function (evt) {
      if (!evt.lengthComputable) {
        return;
      }

      if (progressfn) {
        progressfn(evt.loaded / evt.total);
      }
    };

    req.onload = function (oEvent) {
      let array_buffer = req.response; // Note: not req.responseText
      if (!array_buffer) {
        return reject("didn't get an array buffer back");
      }

      return fufill(array_buffer);
    };

    req.send(null);
  });
}

function renumber (cube) {
  let assignments = new Map();
  
  let cast = (cube instanceof BigUint64Array)
    ? BigInt
    : Number;

  let last_label = cast(0);
  let last_relabel = cast(0);
  let next_label = cast(1);
  let zero = cast(0);

  if (cube.length) {
    last_label = cube[0];
    last_relabel = next_label;
    assignments.set(cube[0], next_label);
    next_label++;
  }

  let cur_label = cast(0);
  for (let i = cube.length - 1; i >= 0; i--) {
    if (cube[i] === zero) {
      continue;
    }
    else if (cube[i] === last_label) {
      cube[i] = last_relabel;
      continue;
    }

    cur_label = assignments.get(cube[i]);
    last_label = cube[i];

    if (cur_label) {
      cube[i] = cur_label;
      last_relabel = cur_label;
    }
    else {
      assignments.set(cube[i], next_label);
      cube[i] = next_label;
      last_relabel = next_label;
      next_label++;
    }
  }

  // +10000 for 10000 paint slots
  let renumbering = new cube.constructor(Number(next_label) + 10000);
  for (let [label, remap] of assignments) {
    renumbering[remap] = label;
  }

  return [ renumbering, next_label ];
}



