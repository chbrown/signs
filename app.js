/// <reference path="type_declarations/index.d.ts" />
var httprequest_1 = require('httprequest');
var notify_ui_1 = require('notify-ui');
var pako = require('pako');
var angular = require('angular');
require('angular-ui-router');
require('ngstorage');
require('flow-copy');
/** cross-vendor compatibility */
function getUserMedia(constraints, successCallback, errorCallback) {
    var vendorGetUserMedia = navigator['getUserMedia'] || navigator['webkitGetUserMedia'] ||
        navigator['mozGetUserMedia'] || navigator['msGetUserMedia'];
    return vendorGetUserMedia.call(navigator, constraints, successCallback, errorCallback);
}
/**
A VideoCapture instance creates an off-screen canvas for rendering video.
*/
var VideoCapture = (function () {
    function VideoCapture(type, quality) {
        if (type === void 0) { type = 'image/jpeg'; }
        if (quality === void 0) { quality = 0.8; }
        this.type = type;
        this.quality = quality;
    }
    /**
    Use the internal canvas to render the video to the desired image format,
    returning a DataURL string. It will initialize the canvas and context with the
    given video element's size when first called.
    */
    VideoCapture.prototype.render = function (video) {
        // console.time('VideoCapture#render');
        if (this.canvas === undefined) {
            this.canvas = document.createElement('canvas');
            this.width = this.canvas.width = video.width;
            this.height = this.canvas.height = video.height;
            this.context = this.canvas.getContext('2d');
        }
        this.context.drawImage(video, 0, 0, this.width, this.height);
        // Canvas#toDataURL(type, encoderOptions)
        //   type: a string indicating an image MIME type
        //   encoderOptions: a number from 0 to 1 indicating image quality
        var image_data_url = this.canvas.toDataURL(this.type, this.quality);
        // console.timeEnd('VideoCapture#render');
        return image_data_url;
    };
    return VideoCapture;
})();
var jpeg_capture = new VideoCapture('image/jpeg', 0.8);
var Recorder = (function () {
    function Recorder(video, frames_per_second) {
        if (frames_per_second === void 0) { frames_per_second = 30; }
        this.video = video;
        this.frames = [];
        this.durations = [];
        this.recording = false;
        this.ms_per_frame = 1000 / frames_per_second;
    }
    Recorder.prototype.capture = function (timestamp) {
        var _this = this;
        // just return if we're not recording
        if (!this.recording)
            return;
        // first step: schedule the next iteration of the loop
        requestAnimationFrame(function (timestamp) { return _this.capture(timestamp); });
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
    };
    Recorder.prototype.start = function () {
        var _this = this;
        this.recording = true;
        // stick a frame on the stack and kick off the capture loop
        var frame = jpeg_capture.render(this.video);
        this.last_capture = window.performance.now();
        this.frames.push(frame);
        requestAnimationFrame(function (timestamp) { return _this.capture(timestamp); });
    };
    Recorder.prototype.stop = function () {
        this.recording = false;
        var elapsed_since_last_draw = window.performance.now() - this.last_capture;
        this.durations.push(elapsed_since_last_draw);
        var total_length = this.frames.map(function (frame) { return frame.length; }).reduce(function (a, b) { return a + b; }, 0);
    };
    return Recorder;
})();
var app = angular.module('app', [
    'ui.router',
    'ngStorage',
    'flow-copy',
]);
app.factory('httpErrorInterceptor', function ($q) {
    return {
        responseError: function (rejection) {
            var message = rejection.config.method + " " + rejection.config.url + " error: " + rejection.data;
            notify_ui_1.NotifyUI.add(message, 5000);
            return $q.reject(rejection);
        }
    };
});
app.config(function ($httpProvider) {
    $httpProvider.interceptors.push('httpErrorInterceptor');
});
app.config(function ($provide) {
    $provide.decorator('$exceptionHandler', function ($delegate, $injector) {
        return function (exception, cause) {
            if (exception instanceof Error) {
                notify_ui_1.NotifyUI.add(exception.message);
                return;
            }
            $delegate(exception, cause);
        };
    });
});
app.config(function ($stateProvider, $urlRouterProvider) {
    $urlRouterProvider.otherwise(function () {
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
app.run(function ($localStorage) {
    $localStorage.$default({
        signsServer: '../',
    });
});
function px(length, fractionDigits) {
    if (fractionDigits === void 0) { fractionDigits = 3; }
    return length ? (length.toFixed(fractionDigits) + 'px') : length;
}
app.filter('px', function () { return px; });
function pct(fraction, fractionDigits) {
    if (fractionDigits === void 0) { fractionDigits = 1; }
    return fraction ? ((100 * fraction).toFixed(fractionDigits) + '%') : fraction;
}
app.filter('pct', function () { return pct; });
app.controller('signsController', function ($scope, $http, $localStorage) {
    $scope.$storage = $localStorage;
    $http.get($scope.$storage.signsServer + '/signs').then(function (res) {
        $scope.signs = res.data;
    });
});
app.controller('uploadController', function ($scope, $localStorage) {
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
    var video = document.querySelector('video');
    // http://src.chromium.org/svn/trunk/src/chrome/test/data/webrtc/manual/constraints.html
    getUserMedia({
        video: {
            mandatory: {
                minWidth: 640,
                minHeight: 480,
                maxWidth: 640,
                maxHeight: 480,
            }
        }
    }, function getUserMediaSuccessCallback(mediaStream) {
        video.src = URL.createObjectURL(mediaStream);
    }, function getUserMediaErrorCallback(mediaStreamError) {
        notify_ui_1.NotifyUI.add("Failed to initialize MediaStream: " + mediaStreamError.message);
    });
    var recorder;
    $scope.startCapture = function () {
        recorder = $scope.recorder = new Recorder(video, 30);
        recorder.start();
    };
    $scope.stopCapture = function () {
        recorder.stop();
        selection_start = 0;
        selection_end = recorder.frames.length - 1;
        updateFilmstripSelection();
    };
    document.addEventListener('mouseup', function () { return mousedown = false; });
    function updateFilmstripSelection() {
        var _a = (selection_start < selection_end) ?
            [selection_start, selection_end] : [selection_end, selection_start], min = _a[0], max = _a[1];
        $scope.filmstrip_selection.start = min;
        $scope.filmstrip_selection.length = max + 1 - min;
    }
    $scope.filmstripMouseEvent = function (index, type) {
        $scope.$apply(function () {
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
    $scope.submit = function () {
        var url = $scope.$storage.signsServer + '/signs';
        var start = $scope.filmstrip_selection.start;
        var end = start + $scope.filmstrip_selection.length;
        var frames = recorder.frames.slice(start, end);
        var imagedata = frames.join('\n');
        var imagedata_z = pako.deflate(imagedata);
        var blob = new Blob([imagedata_z], { type: 'application/octet-stream' });
        var durations = recorder.durations.slice(start, end);
        var avg_ms_per_frame = durations.reduce(function (a, b) { return a + b; }, 0) / durations.length;
        // convert from ms per frame to frames per second
        var framerate = 1000 / avg_ms_per_frame;
        var request = new httprequest_1.Request('POST', url);
        request.addHeader('x-sign-gloss', $scope.sign.gloss);
        request.addHeader('x-sign-description', $scope.sign.description);
        request.addHeader('x-framerate', framerate.toString());
        request.sendData(blob, function (error, response) {
            console.log('request done', error, response);
            notify_ui_1.NotifyUI.add("Uploaded video with id=" + response.id + "!");
        });
    };
});
app.controller('configController', function ($scope, $localStorage) {
    $scope.$storage = $localStorage;
});
app.directive('filmstrip', function () {
    return {
        restrict: 'E',
        template: "\n      <div ng-style=\"{height: (height | px)}\">\n        <span ng-repeat=\"keyframe in keyframes track by $index\" ng-style=\"{left: (keyframe.left | px)}\">\n          <img ng-src=\"{{keyframe.src}}\" ng-style=\"{width: (keyframe_outerWidth | px)}\">\n        </span>\n        <span class=\"selection\" ng-style=\"{\n          position: 'absolute',\n          left: (selection.start * pixels_per_frame | px),\n          width: ((selection.length) * pixels_per_frame | px)}\">\n          &nbsp;\n        </span>\n      </div>\n    ",
        scope: {
            width: '=',
            height: '=',
            frames: '=',
            selection: '=',
            onMouseEvent: '&',
        },
        link: function (scope, el, attrs) {
            var element = el[0];
            var elementOffsetX = element.offsetLeft - element.offsetParent.scrollLeft;
            function overFrame(ev) {
                var offsetX = ev.clientX - elementOffsetX;
                return (offsetX / scope.bounds.width) * scope.frames.length | 0;
            }
            window.addEventListener("resize", function () {
                scope.$apply(function () { return reload(); });
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
            element.addEventListener('mousedown', function (ev) {
                scope.onMouseEvent({ index: overFrame(ev), type: 'mousedown' });
            });
            element.addEventListener('mouseup', function (ev) {
                scope.onMouseEvent({ index: overFrame(ev), type: 'mouseup' });
            });
            element.addEventListener('mousemove', function (ev) {
                scope.onMouseEvent({ index: overFrame(ev), type: 'mousemove' });
            });
        }
    };
});
