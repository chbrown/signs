/// <reference path="type_declarations/index.d.ts" />

import {Request, NetworkError} from 'httprequest';
import {NotifyUI} from 'notify-ui';
var pako = require('pako');

import angular = require('angular');
import 'angular-ui-router';
import 'ngstorage';
import 'flow-copy';

/** cross-vendor compatibility */
function getUserMedia(constraints, successCallback, errorCallback) {
  var vendorGetUserMedia = navigator['getUserMedia'] || navigator['webkitGetUserMedia'] ||
    navigator['mozGetUserMedia'] || navigator['msGetUserMedia'];
  return vendorGetUserMedia.call(navigator, constraints, successCallback, errorCallback);
}

interface Frame {
  image: string; // JPEG/WebP data URL (JPEG for now)
  duration: number; // milliseconds
}

/**
A VideoCapture instance creates an off-screen canvas for rendering video.
*/
class VideoCapture {
  private width: number;
  private height: number;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  constructor(private type = 'image/jpeg', private quality = 0.8) { }
  /**
  Use the internal canvas to render the video to the desired image format,
  returning a DataURL string. It will initialize the canvas and context with the
  given video element's size when first called.
  */
  render(video: HTMLVideoElement): string {
    // console.time('VideoCapture#render');
    if (this.canvas === undefined) {
      this.canvas = document.createElement('canvas');
      this.width = this.canvas.width = video.width;
      this.height = this.canvas.height = video.height;
      this.context = <CanvasRenderingContext2D>this.canvas.getContext('2d');
    }
    this.context.drawImage(video, 0, 0, this.width, this.height);
    // Canvas#toDataURL(type, encoderOptions)
    //   type: a string indicating an image MIME type
    //   encoderOptions: a number from 0 to 1 indicating image quality
    var image_data_url = this.canvas.toDataURL(this.type, this.quality);
    // console.timeEnd('VideoCapture#render');
    return image_data_url;
  }
}

const jpeg_capture = new VideoCapture('image/jpeg', 0.8);

class Recorder {
  private ms_per_frame: number;
  frames: string[] = [];
  durations: number[] = [];
  private recording = false;
  private last_capture: number;
  constructor(private video: HTMLVideoElement,
              frames_per_second: number = 30) {
    this.ms_per_frame = 1000 / frames_per_second;
  }
  private capture(timestamp: number) {
    // just return if we're not recording
    if (!this.recording) return;
    // first step: schedule the next iteration of the loop
    requestAnimationFrame((timestamp) => this.capture(timestamp));
    // decide if it's time to draw
    var elapsed_since_last_draw = timestamp - this.last_capture;
    if (elapsed_since_last_draw > this.ms_per_frame) {
      this.last_capture = timestamp - (elapsed_since_last_draw % this.ms_per_frame);
      var frame = jpeg_capture.render(this.video);
      // this will push the captured frame into slot [i], but will push the new
      // duration into slot [i - 1], which makes sense, since we don't know how
      // long a frame should last until we get to the next one.
      this.frames.push(frame);
      this.durations.push(elapsed_since_last_draw);
    }
  }
  reset() {
    this.frames = [];
    this.durations = [];
    this.recording = false;
    this.last_capture = undefined;
  }
  start() {
    this.recording = true;
    // stick a frame on the stack and kick off the capture loop
    var frame = jpeg_capture.render(this.video);
    this.last_capture = window.performance.now();
    this.frames.push(frame);
    requestAnimationFrame((timestamp) => this.capture(timestamp));
  }
  stop() {
    this.recording = false;
    var elapsed_since_last_draw = window.performance.now() - this.last_capture;
    this.durations.push(elapsed_since_last_draw);
    var total_length = this.frames.map(frame => frame.length).reduce((a, b) => a + b, 0);
  }
}

var app = angular.module('app', [
  'ui.router',
  'ngStorage',
  'flow-copy',
]);

app.factory('httpErrorInterceptor', $q => {
  return {
   responseError: rejection => {
      var message = rejection.data.message || JSON.stringify(rejection.data);
      NotifyUI.add(`${rejection.config.method} ${rejection.config.url} error: ${message}`, 5000);
      return $q.reject(rejection);
    }
  };
});

app.config($httpProvider => {
  $httpProvider.interceptors.push('httpErrorInterceptor');
});

app.config($provide => {
  $provide.decorator('$exceptionHandler', ($delegate, $injector) => {
    return (exception, cause) => {
      if (exception instanceof NetworkError) {
        console.error(exception);
        var message = exception.message;
        NotifyUI.add(message);
        return;
      }
      $delegate(exception, cause);
    };
  });
});

app.config(($stateProvider, $urlRouterProvider) => {
  $urlRouterProvider.otherwise(() => {
    return '/signs';
  });

  $stateProvider
  .state('signs', {
    url: '/signs',
    templateUrl: 'templates/signs.html',
    controller: 'signsController',
  })
  .state('upload', {
    url: '/upload',
    templateUrl: 'templates/upload.html',
    controller: 'uploadController',
  })
  .state('config', {
    url: '/config',
    templateUrl: 'templates/config.html',
    controller: 'configController',
  });
});

app.run(($http, $localStorage) => {
  $localStorage.$default({
    signsServer: '../',
    show_playback_controls: true,
  });
  $http.defaults.headers.common['X-Token'] = $localStorage.token;
});

function px(length: number, fractionDigits = 3) {
  return length ? (length.toFixed(fractionDigits) + 'px') : length;
}
app.filter('px', () => px);
function pct(fraction: number, fractionDigits = 1) {
  return fraction ? ((100 * fraction).toFixed(fractionDigits) + '%') : fraction;
}
app.filter('pct', () => pct);

app.controller('signsController', ($scope, $http, $localStorage) => {
  $scope.$storage = $localStorage;

  function refresh() {
    $http.get($scope.$storage.signsServer + '/signs', {params: {q: $scope.$storage.q}}).then((res) => {
      $scope.signs = res.data;
    });
  }
  $scope.$watch('$storage.q', refresh);

  $scope.play = (event) => {
    console.log('ev', event);
    event.target.play();
  };

  $scope.delete = (sign) => {
    $http.delete($scope.$storage.signsServer + '/signs/' + sign.id).then((res) => {
      var index = $scope.signs.indexOf(sign);
      $scope.signs.splice(index, 1);
      NotifyUI.add(res.data.message);
    });
  };
});

interface UploadControllerScope extends angular.IScope {
  $storage: {
    signsServer: string,
    token: string,
    contributor_id: number,
  };
  filmstrip_selection: {start: number, length: number};
  highlight_img_src: string;
  recorder: Recorder;
  sign: {
    gloss: string,
    description: string,
  };
  submitting: boolean;
  // view event handlers
  startCapture: Function;
  stopCapture: Function;
  filmstripMouseEvent: Function;
  submit: Function;
}
app.controller('uploadController', ($scope: UploadControllerScope, $timeout, $localStorage) => {
  $scope.$storage = $localStorage;

  var mousedown = false;
  var selection_start = 0;
  var selection_end = 0;
  $scope.filmstrip_selection = {
    start: 0,
    length: 0,
  };
  $scope.sign = {
    gloss: '',
    description: '',
  };

  var video = <HTMLVideoElement>document.querySelector('video');
  // http://src.chromium.org/svn/trunk/src/chrome/test/data/webrtc/manual/constraints.html
  getUserMedia({
    video: {
      mandatory: {
        minWidth: 640,
        minHeight: 480,
        maxWidth: 640,
        maxHeight: 480,
        // minFrameRate: 60,
        // maxAspectRatio
      }
    }
  }, function getUserMediaSuccessCallback(mediaStream) {
    video.src = URL.createObjectURL(mediaStream);
  }, function getUserMediaErrorCallback(mediaStreamError) {
    NotifyUI.add(`Failed to initialize MediaStream: ${mediaStreamError.message}`);
  });

  var recorder = $scope.recorder = new Recorder(video, 30);
  $scope.startCapture = () => {
    recorder.reset();
    recorder.start();
  };
  $scope.stopCapture = () => {
    recorder.stop();
    selection_start = 0;
    selection_end = recorder.frames.length - 1;
    updateFilmstripSelection();
  };

  document.addEventListener('mouseup', () => mousedown = false);
  function updateFilmstripSelection() {
    var [min, max] = (selection_start < selection_end) ?
      [selection_start, selection_end] : [selection_end, selection_start];
    $scope.filmstrip_selection.start = min;
    $scope.filmstrip_selection.length = max + 1 - min;
  }
  $scope.filmstripMouseEvent = (index, type) => {
    $scope.$apply(() => {
      if (type == 'mousedown') {
        mousedown = true;
        selection_start = selection_end = index;
      }
      else if (type == 'mousemove') {
        $scope.highlight_img_src = recorder.frames[index];
        if (mousedown) {
          selection_end = index;
        }
      }
      updateFilmstripSelection();
    });
  };

  $scope.submit = () => {
    $scope.submitting = true;
    var url = $scope.$storage.signsServer + '/signs';
    var start = $scope.filmstrip_selection.start;
    var end = start + $scope.filmstrip_selection.length;
    var frames = recorder.frames.slice(start, end);
    var imagedata = frames.join('\n');
    var imagedata_z = pako.deflate(imagedata);
    var blob = new Blob([imagedata_z], {type: 'application/octet-stream'});
    var durations = recorder.durations.slice(start, end);
    var avg_ms_per_frame = durations.reduce((a, b) => a + b, 0) / durations.length;
    // convert from ms per frame to frames per second
    var framerate = 1000 / avg_ms_per_frame;

    var request = new Request('POST', url);
    request.addHeader('x-sign-gloss', $scope.sign.gloss);
    request.addHeader('x-sign-description', $scope.sign.description);
    request.addHeader('x-framerate', framerate.toString());
    request.addHeader('x-token', $scope.$storage.token);
    request.sendData(blob, (error, response) => {
      if (error) {
        console.error('Error uploading video', error);
        return NotifyUI.add(`Error uploading video! ${error}`);
      }
      NotifyUI.add(`Uploaded video with id=${response.id}!`);
      $timeout(() => $scope.submitting = false);
    });
  };
});

app.controller('configController', ($scope, $http, $localStorage) => {
  $scope.$storage = $localStorage;

  $scope.login = () => {
    var contributor = {
      email: $scope.email,
      password: $scope.password,
    };
    $http.post($scope.$storage.signsServer + '/contributors', contributor).then((res) => {
      $scope.$storage.contributor_id = res.data.id;
      $scope.$storage.token = $http.defaults.headers.common['X-Token'] = res.data.token;
    });
  };
  $scope.logout = () => {
    delete $scope.$storage.contributor_id;
    delete $scope.$storage.token;
    delete $http.defaults.headers.common['X-Token'];
  };
});

interface FilmstripScope extends angular.IScope {
  width: number;
  height: number;
  frames: string[]; // list of data urls
  selection: {start: number, length: number};
  onMouseEvent: Function;
  // calculated:
  bounds?: ClientRect;
  pixels_per_frame: number;
  keyframes: {src: string, left: number}[];
  keyframe_outerWidth: number;
}

app.directive('filmstrip', () => {
  return {
    restrict: 'E',
    template: `
      <div ng-style="{height: (height | px)}">
        <span ng-repeat="keyframe in keyframes track by $index" ng-style="{left: (keyframe.left | px)}">
          <img ng-src="{{keyframe.src}}" ng-style="{width: (keyframe_outerWidth | px)}">
        </span>
        <span class="selection" ng-style="{
          position: 'absolute',
          left: (selection.start * pixels_per_frame | px),
          width: ((selection.length) * pixels_per_frame | px)}">
          &nbsp;
        </span>
      </div>
    `,
    scope: {
      width: '=',
      height: '=',
      frames: '=',
      selection: '=',
      onMouseEvent: '&', // call with {index: number, type: string}
    },
    link: (scope: FilmstripScope, el, attrs) => {
      var element = <HTMLElement>el[0];
      var elementOffsetX = element.offsetLeft - element.offsetParent.scrollLeft

      function overFrame(ev: MouseEvent) {
        var offsetX = ev.clientX - elementOffsetX;
        return (offsetX / scope.bounds.width) * scope.frames.length | 0;
      }

      window.addEventListener("resize", function() {
        scope.$apply(() => reload());
      });

      function reload() {
        var bounds = scope.bounds = element.getBoundingClientRect();
        // n_keyframes, when fractional number of keyframes we will show, but
        // we will only show an integer number of keyframes, so we round down.
        var n_keyframes = bounds.width / scope.width;
        // keyframe_offset is the amount of space each keyframe takes up,
        // including padding.
        scope.keyframe_outerWidth = scope.width * n_keyframes / (n_keyframes | 0);
        var take_every_nth_keyframe = scope.frames.length / n_keyframes;
        scope.pixels_per_frame = bounds.width / scope.frames.length;
        scope.keyframes = new Array(n_keyframes | 0);
        for (var i = 0; i < (n_keyframes | 0); i++) {
          scope.keyframes[i] = {
            src: scope.frames[i * take_every_nth_keyframe | 0],
            left: i * scope.keyframe_outerWidth,
          };
        }
      }
      scope.$watchCollection('frames', reload);

      element.addEventListener('mousedown', (ev) => {
        scope.onMouseEvent({index: overFrame(ev), type: 'mousedown'});
      });
      element.addEventListener('mouseup', (ev) => {
        scope.onMouseEvent({index: overFrame(ev), type: 'mouseup'});
      });
      element.addEventListener('mousemove', (ev) => {
        scope.onMouseEvent({index: overFrame(ev), type: 'mousemove'});
      });
    }
  };
});
