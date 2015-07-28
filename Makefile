BIN := node_modules/.bin
DTS := lodash/lodash jquery/jquery angularjs/angular

all: build/bundle.js img/favicon.ico
type_declarations: $(DTS:%=type_declarations/DefinitelyTyped/%.d.ts)

img/favicon-%.png: img/favicon-128.png
	convert $< -resize $*x$* $@
img/favicon.ico: img/favicon-16.png img/favicon-32.png
	convert $^ $@

$(BIN)/watsh $(BIN)/tsc $(BIN)/lessc $(BIN)/cleancss $(BIN)/browserify:
	npm install

%.css: %.less $(BIN)/lessc $(BIN)/cleancss
	$(BIN)/lessc $< | $(BIN)/cleancss --keep-line-breaks --skip-advanced -o $@

type_declarations/DefinitelyTyped/%:
	mkdir -p $(@D)
	curl -s https://raw.githubusercontent.com/chbrown/DefinitelyTyped/master/$* > $@

dev: $(BIN)/watsh $(BIN)/tsc $(BIN)/watchify
	(\
   $(BIN)/watsh 'make site.css' site.less & \
   $(BIN)/tsc -m commonjs -t ES5 -w *.ts & \
   $(BIN)/watchify app.js -o build/bundle.js -v & \
   wait)
