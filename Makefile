BIN := node_modules/.bin
DTS := lodash/lodash jquery/jquery angularjs/angular

all: build/bundle.js
type_declarations: $(DTS:%=type_declarations/DefinitelyTyped/%.d.ts)

$(BIN)/watsh $(BIN)/lessc $(BIN)/cleancss $(BIN)/browserify:
	npm install

%.css: %.less $(BIN)/lessc $(BIN)/cleancss
	$(BIN)/lessc $< | $(BIN)/cleancss --keep-line-breaks --skip-advanced -o $@

type_declarations/DefinitelyTyped/%:
	mkdir -p $(@D)
	curl -s https://raw.githubusercontent.com/chbrown/DefinitelyTyped/master/$* > $@

dev: $(BIN)/watsh $(BIN)/watchify
	(\
   $(BIN)/watsh 'make site.css' site.less & \
   $(BIN)/watchify app.js -o build/bundle.js -v & \
   wait)
