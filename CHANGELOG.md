# [6.0.0](https://github.com/nfroidure/schema2dts/compare/v5.3.0...v6.0.0) (2024-05-30)


### Code Refactoring

* **types:** better null type handling ([5d3134f](https://github.com/nfroidure/schema2dts/commit/5d3134f47b3649b20f11d42ffdc156097ccca85f)), closes [#33](https://github.com/nfroidure/schema2dts/issues/33)


### BREAKING CHANGES

* **types:** Not sure if it really breaks anything but won't hurt to create a major version just
in case.



# [5.3.0](https://github.com/nfroidure/schema2dts/compare/v5.2.0...v5.3.0) (2023-10-09)


### Features

* **types:** encode min length arrays into types ([4d2279f](https://github.com/nfroidure/schema2dts/commit/4d2279f74c361c45e27f461989a0b9e90b6d4d16))
* **types:** new option to create tuples from fixed length arrays ([4ed19a3](https://github.com/nfroidure/schema2dts/commit/4ed19a3391cd02e01a482997b26fb90152b08167))



# [5.2.0](https://github.com/nfroidure/schema2dts/compare/v5.1.0...v5.2.0) (2023-10-05)


### Features

* **tuple:** add tuple validation ([36ec937](https://github.com/nfroidure/schema2dts/commit/36ec9375ff7223ceb82c0f1a8f065e59c8b5e6be))



# [5.1.0](https://github.com/nfroidure/schema2dts/compare/v5.0.1...v5.1.0) (2023-09-29)



## [5.0.1](https://github.com/nfroidure/schema2dts/compare/v5.0.0...v5.0.1) (2023-08-16)



# [5.0.0](https://github.com/nfroidure/schema2dts/compare/v4.1.5...v5.0.0) (2023-08-12)



## [4.1.5](https://github.com/nfroidure/schema2dts/compare/v4.1.4...v4.1.5) (2023-02-02)


### Bug Fixes

* **types:** fix deprecated calls ([e670cf2](https://github.com/nfroidure/schema2dts/commit/e670cf2b39b13a18102df62de28dd928e823efba))



## [4.1.4](https://github.com/nfroidure/schema2dts/compare/v4.1.3...v4.1.4) (2023-01-02)


### Bug Fixes

* **typescript:** avoid using deprecated overlaods ([0a88a88](https://github.com/nfroidure/schema2dts/commit/0a88a88c76c4307ed5cc51983603f77a2f9de1bc)), closes [#24](https://github.com/nfroidure/schema2dts/issues/24)



## [4.1.3](https://github.com/nfroidure/schema2dts/compare/v4.1.2...v4.1.3) (2022-09-01)


### Bug Fixes

* **types:** fix TypeScript types ([d5c6d58](https://github.com/nfroidure/schema2dts/commit/d5c6d582a2db6397b3e51ea2691c0968743f570e))



## [4.1.2](https://github.com/nfroidure/schema2dts/compare/v4.1.1...v4.1.2) (2022-07-18)


### Bug Fixes

* **jsonschema:** support 'null' type ([0c9cd54](https://github.com/nfroidure/schema2dts/commit/0c9cd5405466ab9d261718868d8ad66395197bf0))



## [4.1.1](https://github.com/nfroidure/schema2dts/compare/v4.1.0...v4.1.1) (2022-05-24)


### Bug Fixes

* **types:** export responses types too ([916c9a2](https://github.com/nfroidure/schema2dts/commit/916c9a2afdb75fc0ff48b6056668556243c474c4))



# [4.1.0](https://github.com/nfroidure/schema2dts/compare/v4.0.0...v4.1.0) (2022-05-24)


### Bug Fixes

* **types:** avoid generating empty identifiers ([2b5d554](https://github.com/nfroidure/schema2dts/commit/2b5d55419b919c8ee53fefb31f3eb8973396116d)), closes [#22](https://github.com/nfroidure/schema2dts/issues/22)
* **types:** fix brand and enum types ([f174dd8](https://github.com/nfroidure/schema2dts/commit/f174dd89154df0a42e8305bb802d02209b389ba7))


### Features

* **types:** allow to export root namespaces ([3591eff](https://github.com/nfroidure/schema2dts/commit/3591effbcaade7c378cafc4f2389fe6051149b17))
* **types:** allow to not use enums ([4ea574c](https://github.com/nfroidure/schema2dts/commit/4ea574c212825a2215afc9f6a479f6fa56ec9884))



# [4.0.0](https://github.com/nfroidure/schema2dts/compare/v3.1.0...v4.0.0) (2022-05-19)


### Bug Fixes

* **schemas:** fix unspecified array json schemas ([188eff0](https://github.com/nfroidure/schema2dts/commit/188eff03c75ccdbf2f34f45f8822d50d8a857ffe)), closes [#16](https://github.com/nfroidure/schema2dts/issues/16)


### Features

* **openapi:** allow to opt-out input camelization ([502ed32](https://github.com/nfroidure/schema2dts/commit/502ed32c9ac66d05a816a56cb130f73214eacbb6)), closes [#15](https://github.com/nfroidure/schema2dts/issues/15)
* **types:** add type branding features ([f5fcc35](https://github.com/nfroidure/schema2dts/commit/f5fcc352b3f4ba5282caeaa43ad27d4c608ba770)), closes [#17](https://github.com/nfroidure/schema2dts/issues/17)
* **types:** build real enums from JSONSchema enums ([889b20e](https://github.com/nfroidure/schema2dts/commit/889b20e9d36d5c28d31ad1d5f364d28773386d29)), closes [#18](https://github.com/nfroidure/schema2dts/issues/18)



# [3.1.0](https://github.com/nfroidure/schema2dts/compare/v3.0.2...v3.1.0) (2021-11-23)


### Features

* **schema:** handle nested oneof schema ([bc4059d](https://github.com/nfroidure/schema2dts/commit/bc4059dc24a51b1ccc9d305b03695792a2d2a3bb))



## [3.0.2](https://github.com/nfroidure/schema2dts/compare/v3.0.1...v3.0.2) (2021-11-11)


### Bug Fixes

* **types:** better number parsing ([5da1e64](https://github.com/nfroidure/schema2dts/commit/5da1e64fba141c9150188f507d28271e3e5fa304))
* **types:** fix the double components declaration ([18c5f9a](https://github.com/nfroidure/schema2dts/commit/18c5f9a5a0010866b9606b08059ad2cbc52d5832))



## [3.0.1](https://github.com/nfroidure/schema2dts/compare/v3.0.0...v3.0.1) (2021-10-21)


### Bug Fixes

* **openapi:** fix support for the default status ([0e9b2ad](https://github.com/nfroidure/schema2dts/commit/0e9b2ad018ae55047e85d6691398b174810e178d)), closes [#11](https://github.com/nfroidure/schema2dts/issues/11)



# [3.0.0](https://github.com/nfroidure/schema2dts/compare/v2.2.1...v3.0.0) (2021-10-17)


### Code Refactoring

* **types:** take benefit of components ([69c4cb7](https://github.com/nfroidure/schema2dts/commit/69c4cb73a8ee5d763f2eb5cee6320935ebb45337)), closes [#1](https://github.com/nfroidure/schema2dts/issues/1)


### BREAKING CHANGES

* **types:** This commit may break uses of anonymous types though it is not recommended, it may
be the case in some situations where one is unable to change the Open API file to fit its needs.



## [2.2.1](https://github.com/nfroidure/schema2dts/compare/v2.2.0...v2.2.1) (2021-10-08)


### Bug Fixes

* **types:** fix allOf edge case for required properties ([9318cac](https://github.com/nfroidure/schema2dts/commit/9318cacf66226259c380345b0c73b92400f36523))



# [2.2.0](https://github.com/nfroidure/schema2dts/compare/v2.1.1...v2.2.0) (2021-10-08)


### Features

* **types:** allow to generate unused schemas types ([5ef6a1c](https://github.com/nfroidure/schema2dts/commit/5ef6a1c0e874013c9c578ae647ba144637647c37)), closes [#4](https://github.com/nfroidure/schema2dts/issues/4)



## [2.1.1](https://github.com/nfroidure/schema2dts/compare/v2.1.0...v2.1.1) (2021-10-08)



# [2.1.0](https://github.com/nfroidure/schema2dts/compare/v2.0.1...v2.1.0) (2021-06-25)


### Features

* **api:** allow to filter statuses to only generate subpart of responses ([fa3bb7a](https://github.com/nfroidure/schema2dts/commit/fa3bb7a62fac1f709338001a06433e0a519e3cd8))



## [2.0.1](https://github.com/nfroidure/schema2dts/compare/v2.0.0...v2.0.1) (2021-04-10)



# [2.0.0](https://github.com/nfroidure/schema2dts/compare/v1.0.2...v2.0.0) (2020-11-25)


### Bug Fixes

* **docs:** fix the readme example ([c72258c](https://github.com/nfroidure/schema2dts/commit/c72258c8d6b1f5ddebfcf2096338a3d5039c13cd))
* **openapi:** allow headers to also be string arrays ([bbfc04e](https://github.com/nfroidure/schema2dts/commit/bbfc04ebf293d0faea62ee8589791904b73cd836))



## [1.0.2](https://github.com/nfroidure/schema2dts/compare/v1.0.1...v1.0.2) (2020-09-04)


### Bug Fixes

* **docs:** add repo url ([5c81332](https://github.com/nfroidure/schema2dts/commit/5c8133297aaf1820648bf0faf26bfb779590ef8d))
* **docs:** fix the readme example ([9f65022](https://github.com/nfroidure/schema2dts/commit/9f65022f519c738cfe8f1dcb3bf6e955dfde9fc6))



## [1.0.1](https://github.com/nfroidure/schema2dts/compare/v1.0.0...v1.0.1) (2020-09-03)


### Bug Fixes

* **openapi:** fix openapi parameters requirement ([3e788bf](https://github.com/nfroidure/schema2dts/commit/3e788bfb89cd9b57962ab6e95e9deafd4dca937a))


### Features

* **core:** add travis and coveralls ([176da56](https://github.com/nfroidure/schema2dts/commit/176da56040f60c2ade5886b34e3420d4b44fcd7b))



# 1.0.0 (2020-09-03)


### Features

* **core:** first working version ([652c309](https://github.com/nfroidure/schema2dts/commit/652c3092bc3e792fd39c0333d14ef0953b37525b))



