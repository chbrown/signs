/// <reference path="type_declarations/index.d.ts" />
// import _ from 'lodash';
var angular = require('angular');
require('ngstorage');
// import {Request} from 'httprequest';
/** cross-vendor compatibility */
function getUserMedia(constraints, successCallback, errorCallback) {
    var vendorGetUserMedia = navigator['getUserMedia'] || navigator['webkitGetUserMedia'] ||
        navigator['mozGetUserMedia'] || navigator['msGetUserMedia'];
    return vendorGetUserMedia.call(navigator, constraints, successCallback, errorCallback);
}
var app = angular.module('app', ['ngStorage']);
app.controller('videoController', function ($scope, $timeout, $interval, $localStorage) {
    $scope.$storage = $localStorage;
    MediaStreamTrack.getSources(function (sourceInfos) {
        $timeout(function () {
            $scope.sources = sourceInfos;
        });
    });
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
        console.log('Initialized video MediaStream', mediaStream);
        var stream_url = URL.createObjectURL(mediaStream);
        // console.log('Created ObjectURL "%s" from MediaStream', stream_url);
        video.src = stream_url;
    }, function getUserMediaErrorCallback(mediaStreamError) {
        console.log('Failed to initialize MediaStream: %s', mediaStreamError);
    });
    var mediaCanvas = $scope.mediaCanvas = new MediaCanvas(video, video.width, video.height, 'image/webp');
    $scope.startCapture = function () {
        mediaCanvas.startCapture();
    };
    $scope.stopCapture = function () {
        var a = document.querySelector('a[download]');
        a.href = mediaCanvas.stopCapture();
    };
    $interval(function () {
        $scope.framecount = mediaCanvas.frames.length;
    }, 100);
});
var MediaCanvas = (function () {
    function MediaCanvas(video, width, height, type) {
        if (width === void 0) { width = video.width; }
        if (height === void 0) { height = video.height; }
        if (type === void 0) { type = 'image/webp'; }
        this.video = video;
        this.width = width;
        this.height = height;
        this.type = type;
        this.capturing = false;
        this.frames = [];
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.context = this.canvas.getContext('2d');
    }
    MediaCanvas.prototype.addFrame = function () {
        var _this = this;
        // console.log('addFrame video=%o 0,0 %s,%s', this.video, this.width, this.height);
        this.context.drawImage(this.video, 0, 0, this.width, this.height);
        // Canvas#toDataURL(type, encoderOptions)
        //   type: a string indicating an image MIME type
        //   encoderOptions: a number from 0 to 1 indicating image quality
        var quality = 0.5;
        var url = this.canvas.toDataURL(this.type, quality);
        console.log("Rendered canvas toDataURL(" + this.type + ", " + quality + ")", url.length);
        this.frames.push(url);
        if (this.capturing) {
            requestAnimationFrame(function () { return _this.addFrame(); });
        }
    };
    MediaCanvas.prototype.startCapture = function () {
        this.capturing = true;
        this.addFrame();
    };
    MediaCanvas.prototype.stopCapture = function () {
        // https://github.com/antimatter15/whammy
        this.capturing = false;
        return '';
        // var webm_blob = Whammy.fromImageArray(this.frames, 1000 / 60);
        // console.log('Created webm blob', webm_blob);
        // var webm_url = URL.createObjectURL(webm_blob);
        // return webm_url;
        // var encoder = new Whammy.Video(1000/60);
        // frames.forEach(function(dataURL, i) {
        //   encoder.add(dataURL);
        // });
        // var webmBlob = encoder.compile();
    };
    return MediaCanvas;
})();
