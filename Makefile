BIN := node_modules/.bin
DTS := lodash/lodash jquery/jquery angularjs/angular

all: build/bundle.js build/bundle.min.js img/favicon.ico
type_declarations: $(DTS:%=type_declarations/DefinitelyTyped/%.d.ts)

type_declarations/DefinitelyTyped/%:
	mkdir -p $(@D)
	curl -s https://raw.githubusercontent.com/chbrown/DefinitelyTyped/master/$* > $@

img/favicon-%.png: img/logo.png
	convert $< -resize $*x$* $@
img/favicon.ico: img/favicon-16.png img/favicon-32.png
	convert $^ $@

$(BIN)/watsh $(BIN)/tsc $(BIN)/lessc $(BIN)/cleancss $(BIN)/browserify:
	npm install

%.css: %.less $(BIN)/lessc $(BIN)/cleancss
	$(BIN)/lessc $< | $(BIN)/cleancss --keep-line-breaks --skip-advanced -o $@

%.min.js: %.js
	closure-compiler --angular_pass --language_in ECMASCRIPT5 --warning_level QUIET $< >$@

build/bundle.js: app.js $(BIN)/browserify
	mkdir -p $(@D)
	$(BIN)/browserify -t browserify-ngannotate $< -o $@

dev: $(BIN)/watsh $(BIN)/tsc $(BIN)/watchify
	(\
   $(BIN)/watsh 'make site.css' site.less & \
   $(BIN)/watchify -t browserify-ngannotate app.js -o build/bundle.js -v & \
   wait)
