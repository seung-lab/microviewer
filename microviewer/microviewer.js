class CircularUndo {
  constructor(n) {
    this.buffer = [];
    this.n = n;
    for (let i = 0; i < this.n; i++) {
      this.buffer.push(null);
    }
    this.index = 0;
    this.offset = 0;
    this.length = 0;
    this.bottom = true;
  }

  incr () {
    if (this.bottom) {
      this.bottom = false;
      if (this.length > 0) {
        return;
      }
    }

    if (this.length > 0) {
      this.index++;
    }
    if (this.index === this.n) {
      this.index = 0;
    }

    if (this.position() < this.length) {
      return;
    }

    this.length++;
    if (this.length > this.n) {
      this.length = this.n;
      this.offset++;
      if (this.offset === this.n) {
        this.offset = 0;
      }
    }
  }

  decr () {
    if (this.length === 0) {
      return;
    }
    else if (this.index === this.offset) {
      this.bottom = true;
      return;
    }

    this.index--;
    if (this.index === -1) {
      this.index = this.n - 1;
    }
  }

  position () {
    if (this.index === -1) {
      return -1;
    }
    else if (this.offset <= this.index) {
      return this.index - this.offset;
    }
    return this.index + (this.n - this.offset);
  }

  get () {
    return this.buffer[this.index];
  }

  isDupe (item) {
    let last = this.get();

    if (last === null) {
      return false;
    }
    else if (item[0] !== last[0]) {
      return false;
    }
    else if (item[0] === 'select') {
      return JSON.stringify(item[1][0]) === JSON.stringify(last[1][0]);
    }
    else {
      let [arr1,axis1,slice1] = last[1];
      let [arr2,axis2,slice2] = item[1];
      if (axis1 !== axis2 || slice1 !== slice2) {
        return false;
      }

      return arr1.every( (v,i) => v === arr2[i] );
    }
  }
  
  push (action) {
    let item = null;
    if (
      (action === undefined && elems.paintmode.prop("checked"))
      || (action === 'paint')
    ) {
      let img2d = vol.getSegmentation().slice(AXIS, SLICE[AXIS], true);
      item = [ 'paint', [ img2d, AXIS, SLICE[AXIS] ] ];
    }
    else {
      item = [ 'select', [ structuredClone(vol.segments) ] ];
    }

    if (this.isDupe(item)) {
      return;
    }

    this.incr();
    this.buffer[this.index] = item;

    if (this.position() < this.length - 1) {
      this.length = this.position() + 1;
    }
  }

  undo () {
    if (this.bottom) {
      return;
    }
    this.decr();
    this.do();
  }

  redo () {
    if (this.position() === this.length - 1) {
      return;
    }
    this.incr();
    this.do();
  }

  do () {
    let cur = this.get();
    if (cur === null) {
      return;
    }
    let [ action, args ] = cur;
    if (action === 'paint') {
      let [img2d, axis, slice] = args;
      vol.getSegmentation().insertSquare(
        img2d, axis, slice
      );
    }
    else {
      vol.segments = structuredClone(args[0]);
    }
    render(true);
  }
}

var AXIS = 'z';
var SLICE = { x: 0, y: 0, z: 0 };
var CLICK = { x: 0, y: 0, z: 0, pxvalue: [] };
var SIZE = {};
var PARAMETERS = {};
var PXVALUE = [];
var MOUSE_OVER_IMAGE = false;
var MAGNIFICATION = 1;
var BRUSH = 0;
var PAINTING_MODE = 0;
var PAINT_MOVED = false;
var UNDO = new CircularUndo(250);

let BRUSH_DIAMETERS = {
  0: 1, // px
  1: 25,
  2: 50,
  3: 100,
};

var elems; 
var _needsrender = true;

function create_datacube(dtype, num_bytes, size) {
  let floating = dtype === 'float32' || dtype == 'float64';

  if (floating) {
    return new FloatingPointDataCube({
      bytes: num_bytes,
      size: size,
    });
  }
  else if (dtype == 'bool') {
    return new BooleanDataCube({
      size: size,
    });
  }

  return new DataCube({
    bytes: num_bytes,
    size: size,
  });
}

function configure_segmentation_ui () {
  $(channel).on('mousemove', function (e) {
    e.stopPropagation();
    MOUSE_OVER_IMAGE = true;

    let x = e.offsetX / $(channel).innerWidth(), 
      y = e.offsetY / $(channel).innerHeight();

    x = clamp(x, 0, 0.999999999);
    y = clamp(y, 0, 0.999999999);

    if (AXIS == 'z') {
      SLICE.x = (x * SIZE.x)|0;
      SLICE.y = (y * SIZE.y)|0;
    }
    else if (AXIS == 'y') {
      SLICE.x = (x * SIZE.x)|0;
      SLICE.z = (y * SIZE.z)|0;
    }
    else if (AXIS == 'x') {
      SLICE.y = (x * SIZE.y)|0;
      SLICE.z = (y * SIZE.z)|0;
    }

    render(); 
  });

  function paint (evt) {
    var x = evt.offsetX / $(channel).innerWidth(), 
      y = evt.offsetY / $(channel).innerHeight();

    x = clamp(x, 0, 0.999999999);
    y = clamp(y, 0, 0.999999999); 

    let diameter = BRUSH_DIAMETERS[BRUSH];
    let dx = diameter / $(channel).innerWidth();
    let dy = diameter / $(channel).innerHeight();

    if (ZOOMED) {
      dx /= ZOOM_FACTOR;
      dy /= ZOOM_FACTOR;
    }
    
    if (evt.which === 1) {
      if (elems.paintmode.prop("checked")) {
        let label = parseInt(elems.paintlabel.val());
        if (!isNaN(label)) {
          vol.paintCircle(AXIS, SLICE[AXIS], dx, dy, x, y, label);
        }
      }
      else {
        vol.selectSegsInCircle(AXIS, SLICE[AXIS], dx, dy, x, y);
      }
    }

    render(true);
  }

  function erase (evt) {
    var x = evt.offsetX / $(channel).innerWidth(), 
      y = evt.offsetY / $(channel).innerHeight();

    x = clamp(x, 0, 0.999999999);
    y = clamp(y, 0, 0.999999999); 

    let diameter = BRUSH_DIAMETERS[BRUSH];
    let dx = diameter / $(channel).innerWidth();
    let dy = diameter / $(channel).innerHeight();

    if (ZOOMED) {
      dx /= ZOOM_FACTOR;
      dy /= ZOOM_FACTOR;
    }

    if (elems.paintmode.prop("checked")) {
      vol.paintCircle(AXIS, SLICE[AXIS], dx, dy, x, y, 0);
    }
    else {
      vol.eraseSegsInCircle(AXIS, SLICE[AXIS], dx, dy, x, y);
    }
    render(true);  
  }

  if (vol.has_segmentation) {
    $(document).on("mousemove", function () {
      MOUSE_OVER_IMAGE = false;
      PAINTING_MODE = 0;
      render();
    });

    $(channel)
      .on('click', function (evt) {
        if (BRUSH > 0 || PAINT_MOVED) {
          return;
        }

        let innerWidth = $(channel).innerWidth();
        let innerHeight = $(channel).innerHeight();

        var x = evt.offsetX / innerWidth, 
          y = evt.offsetY / innerHeight;

        x = clamp(x, 0, 0.999999999);
        y = clamp(y, 0, 0.999999999); 

        if (evt.which === 1) {
          UNDO.push();
          vol.toggleSegment(AXIS, SLICE[AXIS], x, y);
          UNDO.push();
        }
      })
      .on('mousedown', function (evt) {
        PAINTING_MODE = 1;
        UNDO.push();
        if (BRUSH === 0) {
          PAINT_MOVED = false;
          return;
        }
        paint(evt);
        evt.stopPropagation();
      })
      .on('mouseup', function (evt) {
        PAINTING_MODE = 0;
        UNDO.push();
        render(true);
        evt.stopPropagation();
      })
      .on('mousemove', function (evt) {
        if (PAINTING_MODE > 0) {
          PAINT_MOVED = true;
          if (PAINTING_MODE === 1) {
            paint(evt);
          }
          else {
            erase(evt);
          }
        }
        evt.stopPropagation();
      })
      .on('contextmenu', function (evt) {
        PAINTING_MODE = 2;
        PAINT_MOVED = false;
        UNDO.push();
        erase(evt);
        evt.stopPropagation();
        evt.preventDefault();
      });
  }
}

function setup_single_volume (data) {  
  render_static();

  let datacube = create_datacube(data.data_types[0], data.data_bytes, SIZE);

  if (data.layer_type === 'segmentation') {
    window.vol = new SegmentationVolume(datacube, true);
  }
  else {
    window.vol = new MonoVolume(datacube, false);
  }

  let vol = window.vol;

  vol.load('/channel', function (ratio) {
    render();
    UNDO.push();
  }).then( () => render() );

  configure_segmentation_ui();
}

function setup_hyper_volume (data) {
  render_static();

  function get_cube(index) {
    return create_datacube(data.data_types[index], data.data_bytes[index], SIZE);
  }

  window.vol = new HyperVolume(get_cube(0), get_cube(1));
  let vol = window.vol;

  vol.load(function (ratio) {
    render();
    UNDO.push();
  }).then( () => render() );

  configure_segmentation_ui();
}

function toggleMenu () {
  elems.rtsidebar.toggleClass("hidden");
  elems.showsidebar.toggleClass("hidden");
}


function loadVolumeFromMicroServer() {
  $.get('/parameters', function (data, status) {
    SIZE = {
      x: data.bounds[3] - data.bounds[0],
      y: data.bounds[4] - data.bounds[1],
      z: data.bounds[5] - data.bounds[2],
    };

    PARAMETERS = data;

    if (data.viewtype === 'single') {
      setup_single_volume(data);
    }
    else {
      setup_hyper_volume(data);
    }

   $(channel).on('mouseout', function (e) {
      PXVALUE = [];
      vol.hover_id = null;
      render(true);
    });

    $(channel).on('click', function (e) {
      var x = e.offsetX / $(this).innerWidth(), 
        y = e.offsetY / $(this).innerHeight();

      x = clamp(x, 0, 0.999999999);
      y = clamp(y, 0, 0.999999999);

      if (AXIS == 'z') {
        CLICK.x = (x * SIZE.x)|0;
        CLICK.y = (y * SIZE.y)|0;
        CLICK.z = SLICE.z;
      }
      else if (AXIS == 'y') {
        CLICK.x = (x * SIZE.x)|0;
        CLICK.z = (y * SIZE.z)|0;
        CLICK.y = SLICE.y;
      }
      else if (AXIS == 'x') {
        CLICK.y = (x * SIZE.y)|0;
        CLICK.z = (y * SIZE.z)|0;
        CLICK.x = SLICE.x;
      }

      CLICK.pxvalue = [ vol.channel.get(CLICK.x, CLICK.y, CLICK.z) ];

      if (vol.segmentation) {
        CLICK.pxvalue.push(
          vol.renumbering[vol.segmentation.get(CLICK.x, CLICK.y, CLICK.z)]
        );
      }
      else if (vol.has_segmentation) {
        CLICK.pxvalue[0] = vol.renumbering[CLICK.pxvalue[0]];
      }
      
      render();
    });

    if (data.viewtype === "hyper") {
      $(document).on('keydown', function (evt) {
        if (evt.keyCode === 16 && !evt.ctrlKey) {
          if (evt.originalEvent.code === "ShiftRight") {
            vol.hide_channel = true;
          }
          else {
            vol.hide_segmentation = true;
          }
          render(true);
        }
      });

      $(document).on('keyup', function (evt) {
        if (evt.keyCode === 16 && !evt.ctrlKey) {
          if (evt.originalEvent.code === "ShiftRight") {
            vol.hide_channel = false;
          }
          else {
            vol.hide_segmentation = false;
          }
          render(true);
        }
      });
    }

    loop();
  });
}

$(document).ready(function () {
  elems = {
    cloudpath: $('#cloudpath'),
    bounds: $('#bounds'),
    dtype: $('#dtype'),
    resolution: $('#resolution'),
    shape: $('#shape'),
    axis: $('#axis'),
    coord: $('#coord'),
    realcoord: $('#realcoord'),
    clickcoord: $('#clickcoord'),
    clickrealcoord: $('#clickrealcoord'),
    loading: $('#loading'),
    pxvalue: $('#pxvalue'),
    clickpxvalue: $('#clickpxvalue'),
    channel: $('#channel'),
    selected_segments: $('#selected_segments'),
    addsegs: $('#addsegs'),
    show_hover: $('#show_hover'),
    show_unselected: $('#show_unselected'),
    magnification: $('#magnification'),
    showsidebar: $('#show-sidebar'),
    rtsidebar: $('#right-sidebar'),
    copysegs: $("#copy-segs"),
    brushsize: $("#brush-size"),
    paintmode: $("#paint_voxels"),
    paintlabel: $("#paintlabel"),
    memoryusage: $("#memory-usage"),
  };
  
  window.channel = elems.channel[0];
  window.channelctx = channel.getContext('2d');

  loadVolumeFromMicroServer();

  elems.paintlabel.on("keyup keypress keydown", function (evt) {
    evt.stopPropagation();
  });

  elems.showsidebar.on("click", function () {
    toggleMenu(); 
  });

  elems.copysegs.on("click", function () {
    navigator.clipboard.writeText(elems.selected_segments.text());
  });

  elems.addsegs.on("keypress keydown", function (evt) {
    evt.stopPropagation();
  });

  elems.addsegs.on("keyup", function (evt) {
    evt.stopPropagation();
    if (evt.keyCode !== 13) {
      return;
    }

    var val = elems.addsegs.val().replace(/\s/g, "");
    if (val === "") {
      return;
    }

    val
      .split(",")
      .map((x) => BigInt(x))
      .forEach((segid) => vol.selectSegment(segid));

    elems.addsegs.val("");
    elems.addsegs.blur();
    vol.hover_id = null;
    UNDO.push('select');
    render(true);
  });

  elems.rtsidebar.on('wheel', function (e) {
    e.stopPropagation();
  });
});

$(document).on('wheel', function (e) {
  var delta = clamp(e.originalEvent.deltaY, -1, 1);
  delta = -Math.round(delta);
  move_slice(delta);
});

var AXES = ['z', 'y', 'x'];
var ZOOMED = false;
var ZOOM_FACTOR = 10;

function zoomTo () {
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    if (AXIS == 'z') {
      x = SLICE.x;
      y = SLICE.y;
      sx = SIZE.x;
      sy = SIZE.y;
    }
    else if (AXIS == 'y') {
      x = SLICE.x;
      y = SLICE.z;
      sx = SIZE.x;
      sy = SIZE.z;
    }
    else if (AXIS == 'x') {
      x = SLICE.y;
      y = SLICE.z;
      sx = SIZE.y;
      sy = SIZE.z;
    }

    if (ZOOMED) {
      elems.channel.css('transform', '');
    }
    else if (MAGNIFICATION > ZOOM_FACTOR) {
      return;
    }
    else {
      let zfactor = ZOOM_FACTOR / MAGNIFICATION;
      let dx = x / sx - 0.5;
      let dy = y / sy - 0.5;

      dx *= elems.channel.width() * zfactor;
      dy *= elems.channel.height() * zfactor;

      elems.channel.css('transform', `matrix(${zfactor},0,0,${zfactor},${-dx},${-dy})`);
    }
    ZOOMED = !ZOOMED;
}

$(document).on('keyup', function (evt) {
  if (evt.keyCode === 'A'.charCodeAt(0)) {
    rotate_axis(2);
  }
  else if (evt.keyCode === 'D'.charCodeAt(0)) {
    rotate_axis(1);
  }
  else if (evt.keyCode === ' '.charCodeAt(0)) {
    zoomTo();
  }
  else if (evt.keyCode === 'Q'.charCodeAt(0)) {
    BRUSH = Math.max(BRUSH - 1, 0);
    render(true);
  }
  else if (evt.keyCode === 'E'.charCodeAt(0)) {
    BRUSH = Math.min(BRUSH + 1, 3);
    render(true);
  }
  else if (evt.keyCode === "I".charCodeAt(0)) {
    invertSelection();
  }
  else if (
    evt.keyCode === 'Z'.charCodeAt(0) && evt.ctrlKey
  ) {
    if (evt.shiftKey) {
      UNDO.redo();
    }
    else {
      UNDO.undo();
    }
  }
});

$(document).on('keypress', function (evt) {
  if (evt.keyCode === 'W'.charCodeAt(0) 
    || evt.keyCode === 'w'.charCodeAt(0)
    || evt.keyCode === '.'.charCodeAt(0)
    || evt.keyCode === 190) {
    
    move_slice(1);
  }
  else if (evt.keyCode === 'S'.charCodeAt(0)
    || evt.keyCode === 's'.charCodeAt(0)
    || evt.keyCode === ','.charCodeAt(0)
    || evt.keyCode === 188) {
    
    move_slice(-1);
  }
  else if (evt.keyCode === 'L'.charCodeAt(0)
    || evt.keyCode === 'l'.charCodeAt(0)
  ) {
    
    vol.shuffleColors();
    render(true);   
  }
  else if (evt.keyCode === 'X'.charCodeAt(0)
    || evt.keyCode === 'x'.charCodeAt(0)) {
    
    if (vol.clearSelected) {
      UNDO.push();
      vol.clearSelected()
    }
    render(true);
  }
  else if (
    evt.keyCode === '='.charCodeAt(0) // '+' without shift
    || evt.keyCode === '+'.charCodeAt(0) 
    || evt.keyCode === 107 // '+' sometimes
  ) {
    vol.alpha = clamp(vol.alpha + 0.1, 0, 1);
    render();
  }
  else if (evt.keyCode === '-'.charCodeAt(0)) {
    vol.alpha = clamp(vol.alpha - 0.1, 0, 1);
    render();
  }
  else if (evt.keyCode === "H".charCodeAt(0)
      || evt.keyCode === "h".charCodeAt(0)) {

    elems.show_hover.prop("checked", 
      !elems.show_hover.prop("checked")
    );
  }
  else if (evt.keyCode === "M".charCodeAt(0)
    || evt.keyCode === "m".charCodeAt(0)) {
    
    toggleMenu();
  }
  else if (evt.keyCode === "U".charCodeAt(0)
      || evt.keyCode === "u".charCodeAt(0)) {

    elems.show_unselected.prop("checked", 
      !elems.show_unselected.prop("checked")
    );
    render(true);
  }
  else if (evt.keyCode === "P".charCodeAt(0)
      || evt.keyCode === "p".charCodeAt(0)) {

    elems.paintmode.prop("checked", 
      !elems.paintmode.prop("checked")
    );
  }
  else if (evt.keyCode === "1".charCodeAt(0)) {
    MAGNIFICATION /= 2;
    MAGNIFICATION = Math.max(MAGNIFICATION, 0.25);
    elems.channel.css("width", (channel.width * MAGNIFICATION) + "px");
    elems.channel.css("height", (channel.height * MAGNIFICATION) + "px");
    elems.channel.css('transform', '');
    render();
  }
  else if (evt.keyCode === "2".charCodeAt(0)) {
    MAGNIFICATION *= 2;
    MAGNIFICATION = Math.min(MAGNIFICATION, 256);
    elems.channel.css("width", (channel.width * MAGNIFICATION) + "px");
    elems.channel.css("height", (channel.height * MAGNIFICATION) + "px");
    elems.channel.css('transform', '');
    render();
  }

  elems.show_unselected.on('click', function () {
    render(true);
  });

  $("#brush-size div.exact").on("click", function () {
    BRUSH = 0;
    render(true);
  });
  $("#brush-size div.small").on("click", function () {
    BRUSH = 1;
    render(true);
  });
  $("#brush-size div.medium").on("click", function () {
    BRUSH = 2;
    render(true);
  });
  $("#brush-size div.large").on("click", function () {
    BRUSH = 3;
    render(true);
  });

});

function rotate_axis(delta) {
  if (PAINTING_MODE) {
    UNDO.push();
  }

  let index = (AXES.indexOf(AXIS) + delta) % AXES.length;
  AXIS = AXES[index];

  let face_dims = vol.channel.faceDimensions(AXIS);

  elems.channel.css("width", (face_dims[0] * MAGNIFICATION) + "px");
  elems.channel.css("height", (face_dims[1] * MAGNIFICATION) + "px");

  render();
}

function move_slice (delta) {
  if (PAINTING_MODE) {
    UNDO.push();
  }

  SLICE[AXIS] += delta;
  SLICE[AXIS] = clamp(SLICE[AXIS], 0, SIZE[AXIS] - 1);
  render();
}

function render_static () {
  if (PARAMETERS.viewtype === 'single') {
    $('#instructions .hyperview').hide();

    if (PARAMETERS.layer_type === 'image') {
      $('#instructions .segmentation').hide();
    }
    else {
      $(channel).addClass("paintable");
    }

    PARAMETERS.cloudpath[0].split('/')
  }
  else {
    $(channel).addClass("paintable");
  }

  let hyper = (PARAMETERS.viewtype === 'hyper') ? 'Hyper ' : '';
  let firstlayer = PARAMETERS.cloudpath[0];

  if (firstlayer === 'IN MEMORY') {
    document.title = `MEMORY - ${hyper}μViewer`;
  }
  else if (firstlayer) {
    document.title = `${PARAMETERS.cloudpath.join(" ; ")} - ${hyper}μViewer`;
  }

  elems.channel.css('width', SIZE.x + 'px').css('height', SIZE.y + 'px');

  let b = PARAMETERS.bounds;
  elems.cloudpath.text( PARAMETERS.cloudpath.join("; ") );
  elems.bounds.text(
    `<${b[0]}, ${b[1]}, ${b[2]}>, <${b[3]}, ${b[4]}, ${b[5]}>`
  );
  elems.dtype.text( PARAMETERS.data_types.join("; ") );
  elems.resolution.text( PARAMETERS.resolution.join('x') );
  elems.shape.text( `<${SIZE.x}, ${SIZE.y}, ${SIZE.z}>` );

  let bytes = PARAMETERS["data_bytes"];

  if (Array.isArray(bytes)) {
    bytes = bytes.reduce((partialSum, a) => partialSum + a, 0);
  }
  bytes *= SIZE.x * SIZE.y * SIZE.z;
  let megabytes = bytes / 1e6;
  if (megabytes < 1) {
    elems.memoryusage.text(`${(megabytes * 1000)|0} kB`);
  }
  else {
    elems.memoryusage.text(`${megabytes|0} MB`);
  }
}

function update_pxvalue () {
  PXVALUE = [];

  vol.hover_id = null;
  if (vol.segmentation) {
    PXVALUE.push( vol.channel.get(SLICE.x, SLICE.y, SLICE.z) );
    vol.hover_id = vol.segmentation.get(SLICE.x, SLICE.y, SLICE.z);
    PXVALUE.push( vol.renumbering[vol.hover_id] );
  }
  else if (vol.has_segmentation) {
    vol.hover_id = vol.channel.get(SLICE.x, SLICE.y, SLICE.z);
    PXVALUE.push( vol.renumbering[vol.hover_id] );
  }
  else {
    PXVALUE.push( vol.channel.get(SLICE.x, SLICE.y, SLICE.z) );
  }

  if (!MOUSE_OVER_IMAGE || !elems.show_hover.prop('checked')) {
    vol.hover_id = null;
  }
}

function render (invalidate_cache=false) {
  update_pxvalue();
  if (invalidate_cache) {
    vol.cache.valid = false;
  }
  _needsrender = true;
}

function hardRender () {
  if (AXIS == 'z') {
    channel.width = SIZE.x;
    channel.height = SIZE.y;
  }
  else if (AXIS == 'y') {
    channel.width = SIZE.x;
    channel.height = SIZE.z; 
  }
  else if (AXIS == 'x') {
    channel.width = SIZE.y;
    channel.height = SIZE.z; 
  }

  vol.show_unselected = elems.show_unselected.prop('checked');
  vol.render(window.channelctx, AXIS, SLICE[AXIS]);

  // compute real coordinate as well
  let b = PARAMETERS.bounds;
  let real = [ SLICE.x + b[0], SLICE.y + b[1], SLICE.z + b[2] ];
  const is_offset = (b[0] != 0) || (b[1] != 0) || (b[2] != 0);

  elems.axis.text(AXIS);

  let padding = Math.ceil(Math.max(Math.log10(SIZE.x), Math.log10(SIZE.y), Math.log10(SIZE.z)));

  let fmt = (v) => String(v).padStart(padding, '\xa0'); // nonbreaking space

  elems.coord.text( `<${fmt(SLICE.x)}, ${fmt(SLICE.y)}, ${fmt(SLICE.z)}>` );

  if (is_offset) {
    elems.realcoord.text( `(${real[0]}, ${real[1]}, ${real[2]})` );
  }

  real = [ CLICK.x + b[0], CLICK.y + b[1], CLICK.z + b[2] ];
  
  elems.clickcoord.text( `<${fmt(CLICK.x)}, ${fmt(CLICK.y)}, ${fmt(CLICK.z)}>` );

  if (is_offset) {
    elems.clickrealcoord.text( `(${real[0]}, ${real[1]}, ${real[2]})` );
  }

  if (vol.loaded()) {
    elems.loading.hide();
  }
  else {
    elems.loading.text( (vol.progress() * 100).toFixed(0) + '%' );  
  }

  elems.magnification.text(`${String(MAGNIFICATION).padStart(3, '\xa0')}x`);
  
  if (PXVALUE.length) {
    elems.pxvalue.show().text( "value: " + PXVALUE.map(display_value).join("; ") );
  }
  else { 
    elems.pxvalue.hide();
  }

  if (CLICK.pxvalue.length) {
    elems.clickpxvalue.text( "value: " + CLICK.pxvalue.map(display_value).join("; ") );
  }
  else {
    elems.clickpxvalue.text(""); 
  }

  if (vol.segments) {
    elems.selected_segments.text( 
      vol.selected().join(', ') 
    );
  }

  if (BRUSH === 0) {
    $(channel).removeClass("small medium large").addClass("exact");
    elems.brushsize.removeClass("small medium large").addClass("exact");
  }
  else if (BRUSH === 1) {
    $(channel).removeClass("exact medium large").addClass("small");
    elems.brushsize.removeClass("exact medium large").addClass("small");
  }
  else if (BRUSH === 2) {
    $(channel).removeClass("exact small large").addClass("medium");
    elems.brushsize.removeClass("exact small large").addClass("medium");
  }
  else {
    $(channel).removeClass("exact medium small").addClass("large"); 
    elems.brushsize.removeClass("exact medium small").addClass("large"); 
  }

  _needsrender = false;
}

function display_value (val) {
  if (PARAMETERS.is_floating) {
    return val.toFixed(4);
  }
  else if ( // color image
    PARAMETERS.layer_type == "image" && PARAMETERS.data_bytes == 4
  ) {
    return `${val} rgb: <${val & 0xff}, ${(val >> 8) & 0xff}, ${(val >> 16) & 0xff}>`;
  }
  return val;
}

function clamp (val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function loop () {
  if (_needsrender) {
    hardRender();
  }

  requestAnimationFrame(loop);
}

function saveNumpy () {
  let d = new Date();
  let filename = `image-${d.getFullYear()}-${d.getMonth()}-${d.getDay()}.npy`;
  vol.getSegmentation().saveNumpy(filename);
}

function saveCrackle () {
  let d = new Date();
  let filename = `image-${d.getFullYear()}-${d.getMonth()}-${d.getDay()}.ckl`;
  vol.getSegmentation().saveCrackle(filename);
}

function invertSelection () {
  vol.invertSelection();
  UNDO.push('select');
  render(true);
}