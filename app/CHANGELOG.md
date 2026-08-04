# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.12.0](https://github.com/CloudgateStudios/race_replay/compare/0.11.4...0.12.0) (2026-08-04)

### Bug Fixes

- compare picker keeps athlete B when only B is selected ([#139](https://github.com/CloudgateStudios/race_replay/issues/139)) ([12b7465](https://github.com/CloudgateStudios/race_replay/commit/12b7465f3c9e0d41221cc809da4d57e1565956ed))
- correct inverted faster/slower labels in race history ([#132](https://github.com/CloudgateStudios/race_replay/issues/132)) ([c2b0e5f](https://github.com/CloudgateStudios/race_replay/commit/c2b0e5fb94da6064cc3666bebd49fc3b0ea0eeb8))
- highlight the faster finish time in the compare Overall row ([#140](https://github.com/CloudgateStudios/race_replay/issues/140)) ([d1b0100](https://github.com/CloudgateStudios/race_replay/commit/d1b010001b1e723a1b1cba35eefb4025fadf1cf4))
- include finish leg when backfilling finishSeconds ([#133](https://github.com/CloudgateStudios/race_replay/issues/133)) ([ac2b217](https://github.com/CloudgateStudios/race_replay/commit/ac2b217ed03fb447fbf0e0733b75e98874acee79))
- ingest finish-column warning accepts Finish Time ([#142](https://github.com/CloudgateStudios/race_replay/issues/142)) ([b1a39ec](https://github.com/CloudgateStudios/race_replay/commit/b1a39ec0fe10024dba7b08d8e900c4239f3e2798))
- races page sort links preserve the active search query ([#141](https://github.com/CloudgateStudios/race_replay/issues/141)) ([bcfe2e5](https://github.com/CloudgateStudios/race_replay/commit/bcfe2e504d2c01cc26c3dcd0f08bde9685469b5a))
- sort Finish column numerically by finishSeconds ([#131](https://github.com/CloudgateStudios/race_replay/issues/131)) ([9972d5e](https://github.com/CloudgateStudios/race_replay/commit/9972d5e293f33dcf7497a05b41ec2296abd436f1))
- strip place prefix from raceresult division names ([#138](https://github.com/CloudgateStudios/race_replay/issues/138)) ([f934ee6](https://github.com/CloudgateStudios/race_replay/commit/f934ee6854e5457aea1f2bd7f86bf3e1cb2f2f0b))
- treat scraper's --:--:-- time placeholder as null on ingest ([#134](https://github.com/CloudgateStudios/race_replay/issues/134)) ([6f02d76](https://github.com/CloudgateStudios/race_replay/commit/6f02d7634c44920a12eb264c91b75211e8dc1274))
- validate dir/page/year URL params instead of 500ing ([#135](https://github.com/CloudgateStudios/race_replay/issues/135)) ([8513dde](https://github.com/CloudgateStudios/race_replay/commit/8513dde7dcd5450daa99c14366260a685552f8ae))

### [0.11.4](https://github.com/CloudgateStudios/race_replay/compare/0.11.3...0.11.4) (2026-08-04)

### Bug Fixes

- correct passing counts for mass-start Pro waves ([#107](https://github.com/CloudgateStudios/race_replay/issues/107)) ([c5192f7](https://github.com/CloudgateStudios/race_replay/commit/c5192f7043d071d58400356c7b0c3f4bd1105a88))

### [0.11.3](https://github.com/CloudgateStudios/race_replay/compare/0.11.2...0.11.3) (2026-07-29)

### [0.11.2](https://github.com/CloudgateStudios/race_replay/compare/0.11.1...0.11.2) (2026-07-15)

### Features

- add sitemap.xml route referenced by robots.txt ([#125](https://github.com/CloudgateStudios/race_replay/issues/125)) ([47b98a7](https://github.com/CloudgateStudios/race_replay/commit/47b98a728a68a7c228ebef22f8c1685b788e7fba))

### Bug Fixes

- 404 race pages that have no events ([#127](https://github.com/CloudgateStudios/race_replay/issues/127)) ([792790f](https://github.com/CloudgateStudios/race_replay/commit/792790f99d8a3fd05656e229eb1929318d5d1afe))
- escape < in JSON-LD structured data block ([#124](https://github.com/CloudgateStudios/race_replay/issues/124)) ([60b0834](https://github.com/CloudgateStudios/race_replay/commit/60b083436369e1a079bc3a64ee1048e9da5c69b5))
- guard ingest against empty leg lists and newlines in CSV values ([#129](https://github.com/CloudgateStudios/race_replay/issues/129)) ([a8acf88](https://github.com/CloudgateStudios/race_replay/commit/a8acf886be3cdfe69f23c4f01c452503cbdbf2b1))
- harden query param parsing against malformed URLs ([#123](https://github.com/CloudgateStudios/race_replay/issues/123)) ([94e01be](https://github.com/CloudgateStudios/race_replay/commit/94e01be3f644fe8fdfcd76d10198fa90a74a2d6f))
- harden the request-race email endpoint ([#126](https://github.com/CloudgateStudios/race_replay/issues/126)) ([3fd6192](https://github.com/CloudgateStudios/race_replay/commit/3fd6192a2d23af15daf03ecc9a34cc2596b2992f))
- resolve raceresult splits from all records, not just the first ([#128](https://github.com/CloudgateStudios/race_replay/issues/128)) ([b7ee6c0](https://github.com/CloudgateStudios/race_replay/commit/b7ee6c099d467446968b9f05efc32eb54ab6693a))
- theme toggle shows wrong state after page refresh ([#115](https://github.com/CloudgateStudios/race_replay/issues/115)) ([4246fa8](https://github.com/CloudgateStudios/race_replay/commit/4246fa8a56a3130abb19fa0776ef58580283e490)), closes [#8](https://github.com/CloudgateStudios/race_replay/issues/8)

### [0.11.1](https://github.com/CloudgateStudios/race_replay/compare/0.11.0...0.11.1) (2026-06-24)

### Bug Fixes

- **security:** add HTTP security headers to Next.js config ([#112](https://github.com/CloudgateStudios/race_replay/issues/112)) ([7564c11](https://github.com/CloudgateStudios/race_replay/commit/7564c1161cf423ca53ec6cc05fcc80b6a4b597c8))
- **security:** replace dangerouslySetInnerHTML theme script with Script component ([#114](https://github.com/CloudgateStudios/race_replay/issues/114)) ([65a426b](https://github.com/CloudgateStudios/race_replay/commit/65a426b9405c4a97ff3b4953fd3d85d3ee16d308)), closes [#8](https://github.com/CloudgateStudios/race_replay/issues/8)
- **security:** SSRF allowlist, SECURITY.md, and README dev warning ([#113](https://github.com/CloudgateStudios/race_replay/issues/113)) ([ff86e7d](https://github.com/CloudgateStudios/race_replay/commit/ff86e7d45b5a246987754077add9fc39f7826af9)), closes [#7](https://github.com/CloudgateStudios/race_replay/issues/7) [#10](https://github.com/CloudgateStudios/race_replay/issues/10) [#9](https://github.com/CloudgateStudios/race_replay/issues/9)

## [0.11.0](https://github.com/CloudgateStudios/race_replay/compare/0.10.0...0.11.0) (2026-06-17)

### Features

- provider-based scraper architecture + raceresult.com (myrace.ai) support ([#104](https://github.com/CloudgateStudios/race_replay/issues/104)) ([f1987ed](https://github.com/CloudgateStudios/race_replay/commit/f1987ed0ef3b884902a942874463b34e095bd3b4)), closes [#103](https://github.com/CloudgateStudios/race_replay/issues/103) [#103](https://github.com/CloudgateStudios/race_replay/issues/103)
- Request a Race form with email notification ([#103](https://github.com/CloudgateStudios/race_replay/issues/103)) ([f7de89a](https://github.com/CloudgateStudios/race_replay/commit/f7de89abe1ce7d5e53ec493e97d86f5f8b815723))

### Bug Fixes

- add robots.txt and noindex to stop crawlers hammering /compare ([#106](https://github.com/CloudgateStudios/race_replay/issues/106)) ([70c2fdf](https://github.com/CloudgateStudios/race_replay/commit/70c2fdf2c4db00a85ed1c78347d40f589475f139))

## [0.10.0](https://github.com/CloudgateStudios/race_replay/compare/0.9.3...0.10.0) (2026-06-17)

### [0.9.3](https://github.com/CloudgateStudios/race_replay/compare/0.9.2...0.9.3) (2026-06-12)

### Bug Fixes

- route PostHog events through reverse proxy to avoid ad blockers ([#97](https://github.com/CloudgateStudios/race_replay/issues/97)) ([6a4dc07](https://github.com/CloudgateStudios/race_replay/commit/6a4dc071298e8cb48506a1a53636e08d50da1ce2))

### [0.9.2](https://github.com/CloudgateStudios/race_replay/compare/0.9.1...0.9.2) (2026-06-10)

### Features

- add ironman florida config ([#95](https://github.com/CloudgateStudios/race_replay/issues/95)) ([694c1ae](https://github.com/CloudgateStudios/race_replay/commit/694c1ae7bafa7cd54e507ee3c364c56c830408db))
- PostHog analytics — pageviews and share events ([#96](https://github.com/CloudgateStudios/race_replay/issues/96)) ([447ba51](https://github.com/CloudgateStudios/race_replay/commit/447ba51cbace0a83cf3e7da660867fcc222f6592))

### [0.9.1](https://github.com/CloudgateStudios/race_replay/compare/0.9.0...0.9.1) (2026-06-10)

### Features

- add config for madison 70.3 ([#90](https://github.com/CloudgateStudios/race_replay/issues/90)) ([699ae59](https://github.com/CloudgateStudios/race_replay/commit/699ae596d2d86f5c84aa5b236b7f1962f3a3e2e6))
- race detail page — stat strip, entry chart, year table ([#91](https://github.com/CloudgateStudios/race_replay/issues/91)) ([0fa7fab](https://github.com/CloudgateStudios/race_replay/commit/0fa7fabc7f150ef2ce9b2b6622b74fcf314aa31f))
- show View [name] CTA when search has exactly one result ([#93](https://github.com/CloudgateStudios/race_replay/issues/93)) ([5a07ff5](https://github.com/CloudgateStudios/race_replay/commit/5a07ff5a054508c0b06336c33dcd278ba0dc8cab))
- year-over-year delta badges on athlete race history table (E1) ([#94](https://github.com/CloudgateStudios/race_replay/issues/94)) ([9256133](https://github.com/CloudgateStudios/race_replay/commit/92561336a97e409984ff022cf1657036b5df2176))

### Bug Fixes

- populate GitHub release body from CHANGELOG section ([#89](https://github.com/CloudgateStudios/race_replay/issues/89)) ([91c7622](https://github.com/CloudgateStudios/race_replay/commit/91c76220c76619064ce3b0869f505c869a5857fa))

## [0.9.0](https://github.com/CloudgateStudios/race_replay/compare/0.8.0...0.9.0) (2026-06-10)

### Features

- add config for rockford and penn ([#85](https://github.com/CloudgateStudios/race_replay/issues/85)) ([a616bb4](https://github.com/CloudgateStudios/race_replay/commit/a616bb42dc9f576ea5a347e3d1af6095c1978cb3))
- normalize segment names via races.config.json segmentNames map ([#83](https://github.com/CloudgateStudios/race_replay/issues/83)) ([2ca46cc](https://github.com/CloudgateStudios/race_replay/commit/2ca46cc534047e4702b94924baa31ee572bc7ea1))
- share improvements — rich pre-filled share text ([#88](https://github.com/CloudgateStudios/race_replay/issues/88)) ([b9bbaac](https://github.com/CloudgateStudios/race_replay/commit/b9bbaacfea128ced55f3ed2c21f083b14cd4836c))
- UI cleanup — races table, search, sort, TRI badge, full-width gradient ([#87](https://github.com/CloudgateStudios/race_replay/issues/87)) ([a477892](https://github.com/CloudgateStudios/race_replay/commit/a477892340771b91135baab2fe936986bed7af1f))
- update about page ([#86](https://github.com/CloudgateStudios/race_replay/issues/86)) ([13d3f51](https://github.com/CloudgateStudios/race_replay/commit/13d3f513072de67a091c71c817ba205cc8a9be71))

### Bug Fixes

- update config ([#84](https://github.com/CloudgateStudios/race_replay/issues/84)) ([43ff91c](https://github.com/CloudgateStudios/race_replay/commit/43ff91c4a5b32e0cf617a9c41805ee0b452d2da0))

## [0.8.0](https://github.com/CloudgateStudios/race_replay/compare/0.7.0...0.8.0) (2026-06-09)

### Features

- Multi-year race history on athlete detail page ([#70](https://github.com/CloudgateStudios/race_replay/issues/70)) ([c54d046](https://github.com/CloudgateStudios/race_replay/commit/c54d046b6d634471639e009a0b08bae0d7e46eaf))
- S1 — race metadata fields on Race model ([#76](https://github.com/CloudgateStudios/race_replay/issues/76)) ([7b6f889](https://github.com/CloudgateStudios/race_replay/commit/7b6f88907a2d1220f1fa52bcee34ea2a5070aef7))
- S2 — event metadata fields (finisherCount, totalCount, etc.) ([#78](https://github.com/CloudgateStudios/race_replay/issues/78)) ([40ec1f5](https://github.com/CloudgateStudios/race_replay/commit/40ec1f56b4774eaca8271974b413409d0e0a9c10))
- T2 — normalize Athlete.gender to Gender enum ([#79](https://github.com/CloudgateStudios/race_replay/issues/79)) ([c8f907e](https://github.com/CloudgateStudios/race_replay/commit/c8f907e2d0bb5aa55b254ea2cf501a5453ba2fb6))
- T3 — add finishSeconds to Athlete ([#77](https://github.com/CloudgateStudios/race_replay/issues/77)) ([fa4f763](https://github.com/CloudgateStudios/race_replay/commit/fa4f763fc20ba2719e221eed86cb783ba98acdc9))

## [0.7.0](https://github.com/CloudgateStudios/race_replay/compare/0.6.1...0.7.0) (2026-06-08)

### Features

- Add normalizedName to Athlete for cross-year/cross-race matching ([#69](https://github.com/CloudgateStudios/race_replay/issues/69)) ([7f481e5](https://github.com/CloudgateStudios/race_replay/commit/7f481e5608cb7656cc1f2193420c9403732695b3))
- athlete comparison view ([#68](https://github.com/CloudgateStudios/race_replay/issues/68)) ([960098f](https://github.com/CloudgateStudios/race_replay/commit/960098f604e5a2221076af78c431e5a4f9d6cb3f))

### [0.6.1](https://github.com/CloudgateStudios/race_replay/compare/0.6.0...0.6.1) (2026-06-08)

### Features

- improve root SEO metadata and OG image CTA ([#66](https://github.com/CloudgateStudios/race_replay/issues/66)) ([24319d9](https://github.com/CloudgateStudios/race_replay/commit/24319d9f86ef9d76a030cb92643b7a15b8232bbd))

### Bug Fixes

- remove release step from prod deploy ([#65](https://github.com/CloudgateStudios/race_replay/issues/65)) ([d9ca700](https://github.com/CloudgateStudios/race_replay/commit/d9ca70012926266e4f7a38fbc7f9c64577b40398))

## [0.6.0](https://github.com/CloudgateStudios/race_replay/compare/0.5.0...0.6.0) (2026-06-08)

### Features

- manual dark mode toggle ([#63](https://github.com/CloudgateStudios/race_replay/issues/63)) ([65a0d7a](https://github.com/CloudgateStudios/race_replay/commit/65a0d7ab4da18b9153d5def7d063f08c6ba777e7)), closes [#3](https://github.com/CloudgateStudios/race_replay/issues/3)
- richer SEO and social metadata with dynamic OG images ([#61](https://github.com/CloudgateStudios/race_replay/issues/61)) ([b64293b](https://github.com/CloudgateStudios/race_replay/commit/b64293bab186e7204f5cea50c7e1580f5c197a13))
- shareable athlete result links with native share support ([#62](https://github.com/CloudgateStudios/race_replay/issues/62)) ([7d65cba](https://github.com/CloudgateStudios/race_replay/commit/7d65cba24393ad2e399d54e2dad4ad83d8fcf9d8)), closes [#2](https://github.com/CloudgateStudios/race_replay/issues/2) [#6](https://github.com/CloudgateStudios/race_replay/issues/6) [#4](https://github.com/CloudgateStudios/race_replay/issues/4) [#5](https://github.com/CloudgateStudios/race_replay/issues/5)

### Bug Fixes

- exclude Wave Finish Time from leg detection ([#60](https://github.com/CloudgateStudios/race_replay/issues/60)) ([81f3653](https://github.com/CloudgateStudios/race_replay/commit/81f365325570f862674e841bf3a2f5987e5a857e))

## [0.5.0](https://github.com/CloudgateStudios/race_replay/compare/0.4.0...0.5.0) (2026-06-08)

### Features

- capture and store complete RTRT athlete data ([#59](https://github.com/CloudgateStudios/race_replay/issues/59)) ([6a1727c](https://github.com/CloudgateStudios/race_replay/commit/6a1727c9000869f32554701f9f2445335d947008))
- mobile-friendly table layout for event results ([#58](https://github.com/CloudgateStudios/race_replay/issues/58)) ([430167e](https://github.com/CloudgateStudios/race_replay/commit/430167ed93af36e79a0924e1fe26d393547534f9))

## [0.4.0](https://github.com/CloudgateStudios/race_replay/compare/0.3.2...0.4.0) (2026-06-07)

### Features

- add about page ([#43](https://github.com/CloudgateStudios/race_replay/issues/43)) ([dd6f3a1](https://github.com/CloudgateStudios/race_replay/commit/dd6f3a14e11e866637028bea59e90c881c3a3c5f))

### Bug Fixes

- actually round the time format ([#42](https://github.com/CloudgateStudios/race_replay/issues/42)) ([6571205](https://github.com/CloudgateStudios/race_replay/commit/6571205a2a3cce6f61e3939a35ec95cbe13d8b26))
- add --dry-run flag and column warnings to ingest script ([#52](https://github.com/CloudgateStudios/race_replay/issues/52)) ([ae9955f](https://github.com/CloudgateStudios/race_replay/commit/ae9955f0440d1f8d6bc9afc0a703eb024ecdab51))
- add AthleteStatus enum to Prisma schema (tech debt [#6](https://github.com/CloudgateStudios/race_replay/issues/6)) ([#55](https://github.com/CloudgateStudios/race_replay/issues/55)) ([a142b38](https://github.com/CloudgateStudios/race_replay/commit/a142b38948eaf21a19d77ae6144a01d1af05625a))
- add error boundary components for graceful error handling ([#47](https://github.com/CloudgateStudios/race_replay/issues/47)) ([7e879b7](https://github.com/CloudgateStudios/race_replay/commit/7e879b748528b8695a997e298962eab205e5d412))
- add isFinish flag to Segment model (tech debt [#3](https://github.com/CloudgateStudios/race_replay/issues/3)) ([#54](https://github.com/CloudgateStudios/race_replay/issues/54)) ([0e18a0c](https://github.com/CloudgateStudios/race_replay/commit/0e18a0c5bd2e0ccef4c6876c8c60e4a76468a9e3))
- add skeleton loading states for event and athlete pages ([#49](https://github.com/CloudgateStudios/race_replay/issues/49)) ([3b44aef](https://github.com/CloudgateStudios/race_replay/commit/3b44aefe1e894618412abaa3ccec26270feb212e))
- always render all four rank cards on athlete page ([#48](https://github.com/CloudgateStudios/race_replay/issues/48)) ([5c7efad](https://github.com/CloudgateStudios/race_replay/commit/5c7efad995fa9a7d3d3b1e76ebbcdecdb479f958))
- debounce search input to reduce excessive router pushes ([#50](https://github.com/CloudgateStudios/race_replay/issues/50)) ([e339387](https://github.com/CloudgateStudios/race_replay/commit/e3393879b3de8369dc63e5c1d7ba33d2baa59915))
- make Athlete.finishTime nullable, replace sentinel string with null ([#53](https://github.com/CloudgateStudios/race_replay/issues/53)) ([a1de4a1](https://github.com/CloudgateStudios/race_replay/commit/a1de4a1818db9e2de5e010e995582ce492a48677))
- pass DATABASE_URL to vercel build step in CI ([#56](https://github.com/CloudgateStudios/race_replay/issues/56)) ([f307f7c](https://github.com/CloudgateStudios/race_replay/commit/f307f7c316631f0fc1eaec8a26ccfca857fc9550))
- remove duplicate release notes in version increment workflow ([#41](https://github.com/CloudgateStudios/race_replay/issues/41)) ([90ba21b](https://github.com/CloudgateStudios/race_replay/commit/90ba21bcbface4654490d52f61c61fa85ccc6c4f))
- trim whitespace from athlete string fields during ingest ([#51](https://github.com/CloudgateStudios/race_replay/issues/51)) ([6ea2027](https://github.com/CloudgateStudios/race_replay/commit/6ea2027558496106b79cc11efe4e52010fdca15b))
- validate DATABASE_URL at startup instead of crashing at query time ([#46](https://github.com/CloudgateStudios/race_replay/issues/46)) ([0832124](https://github.com/CloudgateStudios/race_replay/commit/083212459ed18cbcba9537f7a6f6991d4396ce9c))

### [0.3.2](https://github.com/CloudgateStudios/race_replay/compare/0.3.1...0.3.2) (2026-06-07)

### Features

- add total time in athlete page ([#39](https://github.com/CloudgateStudios/race_replay/issues/39)) ([bc2ce1e](https://github.com/CloudgateStudios/race_replay/commit/bc2ce1e3761ed7c80c63713ab7e692d806994998))
- compute ranks locally when RTRT omits them, hide empty data fields ([#40](https://github.com/CloudgateStudios/race_replay/issues/40)) ([f903a6c](https://github.com/CloudgateStudios/race_replay/commit/f903a6cdcaf6447af3fa02d0e62a622b629cd425))

### Bug Fixes

- make participation funnel responsive on mobile ([#36](https://github.com/CloudgateStudios/race_replay/issues/36)) ([113ad1b](https://github.com/CloudgateStudios/race_replay/commit/113ad1b63122bdfc8107b8bb98217cd24cc14d1b))
- retry on network-level fetch failures in split fetching ([#37](https://github.com/CloudgateStudios/race_replay/issues/37)) ([c7ff445](https://github.com/CloudgateStudios/race_replay/commit/c7ff445f4824ddb9737536ac123ddfb5d60d917b))
- update data scraper for better performance and visibility ([#38](https://github.com/CloudgateStudios/race_replay/issues/38)) ([f7603fa](https://github.com/CloudgateStudios/race_replay/commit/f7603fa9804b7f224937ffbf301512aa3e7cfbc8))

### [0.3.1](https://github.com/CloudgateStudios/racereplay/compare/0.3.0...0.3.1) (2026-06-06)

### Bug Fixes

- correct version tag after CHANGELOG amend ([#35](https://github.com/CloudgateStudios/racereplay/issues/35)) ([947cdcc](https://github.com/CloudgateStudios/racereplay/commit/947cdccb6351d3717adacb70022a28672ceefb2d))

## [0.3.0](https://github.com/CloudgateStudios/racereplay/compare/0.2.0...0.3.0) (2026-06-06)

### Features

- add visible labels to event results filters ([#33](https://github.com/CloudgateStudios/racereplay/issues/33)) ([efdb0ce](https://github.com/CloudgateStudios/racereplay/commit/efdb0cefac32f7943ddc6bacce8e8ccc57cf9ba1))
- landing page, all-races page, and UI polish ([#27](https://github.com/CloudgateStudios/racereplay/issues/27)) ([6b1f65b](https://github.com/CloudgateStudios/racereplay/commit/6b1f65b698b97470a9a3d8b5b5e992b785a8a10e))
- replace event badges with participation funnel ([#34](https://github.com/CloudgateStudios/racereplay/issues/34)) ([93e4900](https://github.com/CloudgateStudios/racereplay/commit/93e49004c8f588276a0f200d81fbd7c83389d023))
- skip year picker when race has only one year of data ([#29](https://github.com/CloudgateStudios/racereplay/issues/29)) ([f3b6664](https://github.com/CloudgateStudios/racereplay/commit/f3b6664abc6fc732ef990fe19a74be2c25db131d))
- slim results table to Net columns only ([#32](https://github.com/CloudgateStudios/racereplay/issues/32)) ([71d2ae0](https://github.com/CloudgateStudios/racereplay/commit/71d2ae026d30a45f9f4cca2b4f4cc41295759da3))

### Bug Fixes

- downgrade eslint to ^9 to satisfy eslint-config-next peer deps ([#30](https://github.com/CloudgateStudios/racereplay/issues/30)) ([d9d155d](https://github.com/CloudgateStudios/racereplay/commit/d9d155d0486547291ffa922326007db2c6578f96))
- full-bleed hero gradient ([#28](https://github.com/CloudgateStudios/racereplay/issues/28)) ([4cd4f1d](https://github.com/CloudgateStudios/racereplay/commit/4cd4f1de9f78687b5c4a8a17be3f28e6f9d6d8c8))

## [0.2.0](https://github.com/CloudgateStudios/racereplay/compare/v0.1.0...v0.2.0) (2026-06-06)

## 0.1.0 (2026-06-06)

### Features

- initial RaceReplay web app ([#15](https://github.com/CloudgateStudios/racereplay/issues/15)) ([38d441e](https://github.com/CloudgateStudios/racereplay/commit/38d441e21f2ffc7920e08036e4ebeb050b60fb37))
- phase 1 — scaffold, Prisma schema, project config ([#5](https://github.com/CloudgateStudios/racereplay/issues/5)) ([fd189eb](https://github.com/CloudgateStudios/racereplay/commit/fd189ebce0e67037471ddbbff7331d819af56ba2))
- POC physical passing algorithm verified on two real races ([#3](https://github.com/CloudgateStudios/racereplay/issues/3)) ([72cf6fc](https://github.com/CloudgateStudios/racereplay/commit/72cf6fc20c15309c018be7b77064e96515870ab2))

### Bug Fixes

- pass --env-file .env.local to all prisma scripts ([#9](https://github.com/CloudgateStudios/racereplay/issues/9)) ([e6795ee](https://github.com/CloudgateStudios/racereplay/commit/e6795ee9de764431d07e3313480d0b0d61f84d9d))
- update rtrt script ([#11](https://github.com/CloudgateStudios/racereplay/issues/11)) ([79c805f](https://github.com/CloudgateStudios/racereplay/commit/79c805fbe4bbb955dc3d0c8d280ad9d382b07967))
- use dotenv-cli to load .env.local for prisma scripts ([#10](https://github.com/CloudgateStudios/racereplay/issues/10)) ([e06e539](https://github.com/CloudgateStudios/racereplay/commit/e06e53987e05bfaf2052de34d35b603e1db594bc))
