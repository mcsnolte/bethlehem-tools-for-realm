.DEFAULT_GOAL := help

NODE ?= node
PYTHON ?= python3
BUMP ?= patch

.PHONY: help test test-suites build release version

help:
	@echo "make test                  Run all tests and build without changing the version"
	@echo "make build                 Rebuild the current version"
	@echo "make release               Run tests, bump the patch version, and package"
	@echo "make release BUMP=minor    Run tests, bump the minor version, and package"
	@echo "make release BUMP=major    Run tests, bump the major version, and package"
	@echo "make version               Show the current release version and date"

# A failed test stops test/release before packaging or changing the manifest.
test-suites:
	$(NODE) --test
	$(PYTHON) -m unittest discover -s tests -p "*_test.py"

build:
	$(PYTHON) scripts/build.py

test: test-suites
	$(MAKE) build

# The bump belongs in the recipe, after test-suites finishes, including with make -j.
# Run once per release; use make build for subsequent rebuilds.
release: test-suites
	$(PYTHON) scripts/build.py --bump "$(BUMP)"

version:
	@$(PYTHON) -c "import json; from pathlib import Path; print(json.loads(Path('manifest.json').read_text(encoding='utf-8'))['version_name'])"
