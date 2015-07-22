BIN := node_modules/.bin
DTS := lodash/lodash jquery/jquery angularjs/angular

all: build/bundle.js
type_declarations: $(DTS:%=type_declarations/DefinitelyTyped/%.d.ts)

$(BIN)/lessc $(BIN)/cleancss $(BIN)/browserify:
	npm install

type_declarations/DefinitelyTyped/%:
	mkdir -p $(@D)
	curl -s https://raw.githubusercontent.com/chbrown/DefinitelyTyped/master/$* > $@

dev: $(BIN)/watchify
	$(BIN)/watchify app.js --outfile build/bundle.js -v
