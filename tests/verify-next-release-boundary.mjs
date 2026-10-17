// Approved release integration, typed-test hold, study completion, word-only display hold,
// and account learning isolation/incremental persistence (decision033,2026-10-15).
// Historical export/release guards run unchanged on their exact source commits.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// The old release allowlist had already drifted on main. Freeze this approved
// feature against its fetched main base; keep the original historical gate below.
const base='fd67f0a0f6f09be247f371d085ad097aea304784';
const historicalBase='19bbb8d840df5129f4224f38093b8aa0b443f002';
const guard='tests/verify-next-release-boundary.mjs';
const expected={
    ".github/workflows/account-learning.yml": "2ccb4333a9bd32286dac7d08149b1779caeb1d0651ea4c4780f5503e30450d3c",
    ".github/workflows/pdf-ocr-native-stress.yml": "89fff87f69323391aec38c997516a0e4e26853c3e1cc5576ae6289c541936102",
    ".github/workflows/pdf-pointer-ink.yml": "0995ff0bbdbb117291cf89c34c8592b15217f29527e2d611ceb42bc9d91640ea",
    ".github/workflows/preview-intent-check.yml": "d3c51892b973779530516ba725b239d47354054bd7fd3c384276041393654153",
    ".github/workflows/social-import.yml": "b5a749685790947297724b74a44e4b2e3ae827c20826cb6935be90ef34dc4111",
    "DESIGN.md": "3c7f1466c1f9c2b215555d82e434e4979f24721820f43df9c7dd84eb6d6a3e50",
    "PRIVACY.md": "bdee7e68a9aa3eb4570fdec496c8cf3088dd4a41b38e7b4603f59db31db5025f",
    "SYNC.md": "c9ca7c313aabd8b82db71393510e725719a85da7c590d43ab180f9a545c36161",
    "assets/auth/README.md": "d9533bd379393c34ab3bb2a54d4d623d4bb89acc7e2f9211d512fa8adeae9437",
    "config.js": "6b1fbcda553e20e6fba88176e06312836c2b4f568d64daa2791cce5faaaac59e",
    "docs/decisions/002-dictionary-panel-reading-anchor.md": "3514973905ef0f687ecad896bfa270c6357e0b0bfb9e0fd3ebc3e1879ca31318",
    "docs/decisions/003-shared-control-glass.md": "f289ad147a363fcb923f55960c95db442bfb9466aefde8cacd49c8122cf2c544",
    "docs/decisions/007-word-item-storage.md": "b3230b0817b18964cc0afdb3f02ce8a886787b6fec14b64ece8d3e52f9dca582",
    "docs/decisions/008-web-content-ingestion.md": "b2b424b96c6c7b5fec5d4d0658a12f76b0fb9ff1c2919d31e84cdf8838f4df3a",
    "docs/decisions/009-pdf-ink.md": "f3ba1ab17d183f5017452077cf38b270722e8f1d6c487cc00f5bddb30fe74ada",
    "docs/decisions/011-word-lookup-recovery.md": "11c7098c1a85dfa4e778a9388090ab5161e3718d419a3d62d87764de7746476f",
    "docs/decisions/012-library-study.md": "7fb9ba41f53ee1e21a27336233e49086d725360192a2bc4d62212d383b6750ea",
    "docs/decisions/015-rss-intent-and-public-catalog.md": "f8296533f8328726a459cd79b7dfab02b96718b193c06d9b3d1a763558f32b7d",
    "docs/decisions/016-social-auth.md": "d1fdd1cb5b23818300b27cf75bd80a114a0d54c0af4aad273b34223ac5bd71ab",
    "docs/decisions/021-scanned-pdf-ocr.md": "cfa6238c699126fb9de9af7d8d7391a67c24003ab10a216491c2a5e6fa0184eb",
    "docs/decisions/023-vocabulary-study-sets.md": "26d30d3e58245e97d8d593648629916f0b40269147e6c23b984cc86bbc6454ab",
    "docs/decisions/031-vocabulary-test.md": "f9a6a46151df7a40a941c502d6d18504e4a627f1ed80f91193cd5c0f66cd1434",
    "docs/decisions/032-next-ios-android-release.md": "d54ca9ea39e2a842a3a9f85f65aee4ce4d41d017965edc494bc5344a29e4a6b6",
    "docs/decisions/033-account-learning-data.md": "d67741a854a9f4b9064d6da1099c0d1896e058929a590f40430ef23d62071f00",
    "docs/decisions/034-selective-book-sync.md": "13383e1406e9f3d02ad66076ec3a89ba05a59e950079b22b613ee4cbb820226e",
    "docs/decisions/035-book-ink-sync.md": "951ee4261f0dbccdd273b69b9caa8f8e5225b715fe27e1f8d7f885986ad57fb1",
    "docs/decisions/035-public-reading-payloads-r2.md": "a1dbd8a8f6e2435a0978ba9718840f2bc3315c983c3936e86214205edd0c8704",
    "docs/privacy.html": "ed796df746a08547ef7b634457721f5d67078bb69fc3629248cfd250a94a568f",
    "docs/qa/account-learning-20261015.md": "9df0549e17ffa6abb32666207cd7ee6d7287811a4fa0aec2392ba8fd0840874c",
    "docs/sync.html": "5ae428c9ba03d580539924422eec65525a1a37973653f24c68061827aeb2f8cf",
    "index.html": "159f6fc5f0aaf290f1c1f050eb02af3511cd17c20b781937bad0f5d97d51d45f",
    "ios/App/App.xcodeproj/project.pbxproj": "6dbbfe37a5b99792f03b5f401ac54dfaa2e3b1935ad3e06818ed0c2a8d89e069",
    "ios/App/App/BreezePdfOcrPlugin.swift": "a7b590bde55e61ef37f7dde5cc6aeeeb8a6a4b0e40867df951bdfdde13c0a31e",
    "ios/App/App/SceneDelegate.swift": "eb341df49bcc1702588b7220a6045a21a697747c5b77de8c87ed122482cf24ee",
    "landing/index.html": "6dd2680caf067ad733e2ff0590a211a791515a16b93f91fc587a2382114695bd",
    "package.json": "32ffbfc09a5203d0d2f7727cbb434926c163ca99de7adb35567ad6cb3273fef5",
    "scripts/core/account-scope.js": "2d083ed6d07a12c7162fcb55d6660da34070334a0b0a04f845fa66254a7498f0",
    "scripts/core/boot-safety.js": "c253b59cc0bb7399987f672fb4fd7aed97022f73816bddbd6590d235aaffc526",
    "scripts/core/state.js": "46263a7e110aef69f222ed7d2d3e7cfe1a9ec00b6b7301e1d6a76af3e6d322c3",
    "scripts/core/storage-quota.js": "fff776fa26f7e737d6126ec8dc5d547cf9854648a73c99ed7da90061d702b45b",
    "scripts/core/storage.js": "6841c31aa8e9d1e6e5a8997b194e7463af6068190c33c5a7decc806d97231ac3",
    "scripts/core/study-set-test.js": "3b3ced0964bb06d8785cf4d2bc93284e627d111df5edae05681a943d30465494",
    "scripts/core/study-sets-storage.js": "6b6f149543cc63a3ac202318518748faf8061dfc5ecb51c6fc32062d415d3911",
    "scripts/core/study-sets.js": "13c27671b5fc73f7b1fe69d9a8394a0fded426e7dfea56c49b0c8b57a02cb626",
    "scripts/core/vocabulary-test-storage.js": "a29693471e1b8e5ef28258b4149e9872f0d9c0b11bea220cb7ae3e2a98b7f72f",
    "scripts/core/word-integrity.js": "26df65911266aed4eccbbde3b3ffd4ff17edb8aa3c973e9d0ec39496aad99292",
    "scripts/dictionary/dictionary.js": "a5da5618c49cb9e3e7bdd7ae94ef1fb75e613a011e615315ae98ccab92fef1d7",
    "scripts/dictionary/easy-explanation.js": "fc76e90ee36f765eec4c34328b888eb016b3c6890dc9266adb8a4adc419d591a",
    "scripts/importers/article.js": "e9d7b6b38928860682e0d2d46d94053f2f2946c024069ae21c7eb175c9f37eb7",
    "scripts/importers/importers.js": "36710c997baecade016796cd3577dbf9638630c243f9d9dfd7c4c8fdf7be70a6",
    "scripts/importers/rss.js": "c8316809d21afd57323415e5d362ca47ef6d13bc1ed0fa18e0b4707ee15deec4",
    "scripts/importers/social.js": "0278bfd4ef980dd3deaf307956eea4480dcf211966094cc294901a0260e6a731",
    "scripts/library/article-preview.js": "3db41fbdc24f7c0c778017710c0537398b97e2d85e3fbf1647295a30139a08b1",
    "scripts/library/book-cloud.js": "179545bfea401d89e0f2213c97ef521edd48b2cbec7aa78e88d7bb0efd1779a9",
    "scripts/library/book-edit.js": "5670e5897d40b74973967dbb92a974831d92f6d41459b70ecf416c14fa67626e",
    "scripts/library/ink-sync.js": "d4cbc42e7432c6754dd43f5915612d2765c55db91f710d7b118a98a90a260d04",
    "scripts/library/library.js": "8ef9c57cd4bdb99c490d9c3030dea18911d0fffd5346afcc58af19c8ea0b0f5b",
    "scripts/main.js": "7f224bbcf0eba5600f3bfb4442ddeef1fd0399ca5c9a521b9c1f692ce9e905ee",
    "scripts/reader/epub-original.js": "b865ef6175e8d0f475853d0cbf2f89dc5608329ddc888529baa684c698c6795d",
    "scripts/reader/gesture.js": "faf00a92a774f0ef4303d8ce8e675ae522ad922cccb2f3b7e0f14578a4cd8ce2",
    "scripts/reader/pdf-ink.js": "83a7db3a85780eba3f69ee65d78bea56a590e5657faced493347e5928b0a1bba",
    "scripts/reader/pdf-ocr.js": "01155e3119af4e83cb90b8c58f923f0ff0841cf502157ccca5c838ce2883b01e",
    "scripts/reader/pdf-ocr-library.js": "fe31104515b9fb560fa06107034532cf9702ab9dbbf8e47a59481a690807c4d0",
    "scripts/reader/pdf-navigation.js": "084e3fef01427feb412b496fd1dddb36e714daf0ceabbc901676bd65cd4e8bf1",
    "scripts/reader/pdf-original.js": "726e86e82d24a72696e33b61d453d148e3c849ed2f69c5004db5d0026f9fcd46",
    "scripts/reader/pdf-pinch.js": "01d57e65780d678bec6c6d185330a2b6ba49e73c11eb0d67e3c330140babd32c",
    "scripts/reader/reader-modes.js": "9a4b64888a882afb9c0733eed5f6053812bcf13b7e0af9ad5c8fed752e772198",
    "scripts/reader/reader-scroll.js": "1f6fa5534dc249348cfe3fb32c4c89a6e914d183bb5ee77a819bf494b9a947cf",
    "scripts/reader/reader.js": "f4b3b582c3c825dfb3c673e1c65464a0da7baf40ed0f2dc5339284d79ba877d2",
    "scripts/sync/learning-sync.js": "4a39c4f0ae622580633715d52880254290eb661ffc2b8297b3eaff796b33af15",
    "scripts/sync/sync.js": "720c405cbc81130cc0255db27ed631f6c1780285beb090483fe7bbdf3c01b8fb",
    "scripts/ui/library-refresh.js": "7a6b6c1f486fa0c7ffd1ce18767091862e7a90d9e4c1576e36a537ab474b07b4",
    "scripts/ui/onboarding.js": "0f95c0b7ed6f477f55bcea75b1eb794c6d708dfb753794907faeaea9f75c32a2",
    "scripts/ui/study-motion.js": "6ba528d8dd6d4d20439394de119c853e2f9e446175967ea7acaa3c22468d6ef5",
    "scripts/ui/study-set-test.js": "10f226d6e0f3e81cce4ef9d79171e52ca9143b8064831581c26f7f006acf38bb",
    "scripts/ui/study-sets.js": "9ea519c5ffd1a3377e5ccd4555d8d8e5c23075e25a4e5716a81d7920fecddb6e",
    "scripts/ui/vocabulary-review.js": "9c80dddb6f978b77a403284d87b843681d05c4ca51885287567a2c27b27defb7",
    "scripts/ui/wordbook.js": "6a635eaf84c4912d1cce486bb88fd64b871c6cb3a3439d76ad02c299da925803",
    "server/article/index.ts": "078924bf25202e60c88b0aac129dbda3a359255cbed43aee6d949fb355dcc0f0",
    "server/books/handler.ts": "5bb10d2f90ed77b8019af228d5f1590bd6675fd2f6052b0c7b5f86a01125de6a",
    "server/books/index.ts": "09ef295aceabd49f4f555dd4808db48cc79756ace7de60f12df7fafb2517e335",
    "server/books/r2.ts": "ff0da8de2f736ad396a07446c54a36ab7f06eb50aab288e3f06a269106b945e4",
    "server/dict/index.ts": "22117c5a7b808858f1947ceee79b37e9dff2e057d6ac8527d688b57f09d33fc1",
    "server/dict/study-set-test.ts": "5d873ebd9a40be7a94a05fc78b3309a0d5dfbcfdbfa2b87b970bf5b1184d8ceb",
    "server/dict/telemetry.ts": "d10df614b7eeba81997f5be68290e8d5d6042a0d05753e5ffcba42df666ba8e6",
    "server/reading-cache/src/feeds.mjs": "45db42acc27adedfc2daf05994c19d5e268604d988f9e7b496f157e3795fc4ac",
    "server/reading-cache/src/index.mjs": "18e01b2a4abfc1808d07c83aeed58ab8364efc1d94cd8043eb45070e91495dab",
    "server/reading-cache/src/keys.mjs": "14cc5f37554fbc6056a43b5f4e1a690fb793e20b24bbb295e83edd5ef45b43f0",
    "server/reading-cache/wrangler.toml": "66041e44827e90c869b54b6d6435b810c82b08d9c89622882c4d06675c31aba3",
    "server/sync/book-cloud.sql": "b228628558191844a51742567033e21c99e9d61cd939e2884ec68663daa391b9",
    "server/sync/book-ink.sql": "fe208a50226e26ae63b190f7a87508a02e977d98b9480b5e34b85fbf939ecad2",
    "server/sync/study-state.sql": "158ea25b80c8ccebeaa353ce297ab3e9de657b056d727142133fcd85384b9eb4",
    "server/sync/wordbook-patch.sql": "66d8fdec07152bd1c52d3917c914e11290e213b4dc4a8724545df9d40951dfd5",
    "styles/article-preview.css": "6f944b5a10d413388e540f5ac7821668fa24b03246bcfbb5dabf7493ce4dc7c1",
    "styles/base.css": "4d0c83fbd08f74dd76a5f4003fc82b251cd220aa934a5f7c66b5da94d2e7d2c0",
    "styles/components.css": "e01f9d18e5ebcec84a52754683a9611f8f02305d94ce9d09c4c0c3e48fb46ea6",
    "styles/header-controls.css": "472077260382669d3e41f3f55d9abc68380f2d901f5506b4184858e30ef7a393",
    "styles/home-shell.css": "f5622f350b801e88ffd7dd40af9364bd5062290afdbd40146722f5da025a3ecd",
    "styles/home.css": "2ed4ead23d32284254e8e7615744ee8bda410a6763d50ce3d45eb69418e08d1d",
    "styles/pdf-ink.css": "1a1b9b1c790aa0824ba5b8374e2294f4fb84f47486a6e7a1fedddfda8059e805",
    "styles/reader.css": "a2dc8a3e3829b91548789a09690634de0d5f89d8c36747c44d06b896f9dd90e3",
    "styles/study-sets.css": "6b8a0acc97077f8dcdb65fea8e725b8bff38047f174deada6978a0638dd8857c",
    "styles/study.css": "ff988d52b2b255c33a2b086d886deb52deabc2f5d7af68694027f8c8dc1250a3",
    "styles/surfaces.css": "d5da3fd33b59287faab0ea9baa0b8170e273d3610f4ce72df2ad592c6f6d95f6",
    "styles/tokens.css": "dd26ef5223e528a841e246b35aa949a84e6e26399beac448f8ccd1e995ccd8d3",
    "styles/vocabulary-test.css": "d05f4c6824210101fed93726eed67eb1aaaa348ae2d643901440785c17cae090",
    "styles/wordbook.css": "fe41d56ca1cc68953b9616a87e94e232df3baa31bf3fc2fbac2be44b1733e22b",
    "supabase/functions/article-preview/index.ts": "486dc27e1af92c5e69c6467c849bed97e2996b1346539ed28584c200e312bc9f",
    "supabase/migrations/20261017130155_dict_ai_timeout_outcome.sql": "fd804ad4140c4af0f83155c6888575db4d0d248432f0d3272c6674050ea7e225",
    "support/index.html": "4f6647c6a0354b2172da9a23556e9b53c19ab090120afc2182e616acb374b639",
    "sw.js": "e9f32563377e1dea51a9425058001cde5851c4e7ff9689651f02aac898cf3adc",
    "tests/capture-app-icon-family.mjs": "5139f5ed90f0d28acafb11653d30d81524cac2499c6cdf1f1b4695bf0f44b88a",
    "tests/capture-approved-home-close.mjs": "a122d2d771f7a339fd22db5baa21ba21633fe8bb57752fe0f0c061d3b841e233",
    "tests/capture-safari-dock-review.mjs": "39215652c25d5c44034783317a7c5d7ad1292a9d4d00461268841573ddb419a1",
    "tests/capture-safari-optical-review.mjs": "c0552b4ac41eee1c532abc19ae1efc407ec126ad5509eaee406359f17af782e0",
    "tests/capture-safari-sidebar-review.mjs": "97188f86c7f1637f0404401ec61799c122f85f590f94c4d52b1be8f254c43b5e",
    "tests/egress-rss-transport.mjs": "06dc161d3ecb69e8dafaf89a143db1fb42491ab906cfd0acebca723f65e1660b",
    "tests/helpers/app-icon-family-scenes.mjs": "f54d88ce3c7f3a57d9f3c0a3ff17b9acc3fbdac66e9134c4193eec0e1afca08f",
    "tests/measure-study-sets-list-browser.mjs": "47d27c32201925399ad8eb28f63e9d3dfcb5dd7208805564ed7e423d0b68d21d",
    "tests/sync-test-transport.mjs": "ff08f8ca16a7ff728e865511d3b092e9f24768d75ba49334bdb9e62a74de29dd",
    "tests/verify-account-scope-browser.mjs": "7080605d50de583471f497a57214146f0d4fce85d9e458c40a17025138fff513",
    "tests/verify-account-scope.mjs": "72a812fca5cb2cc79810680f74580f0db66e0a09426ee12ccbcad80198a1f99e",
    "tests/verify-apple-login.mjs": "acfe3175a1693da4465ec082b27777a9d9c3123ba02c5f21a7bbb0aa36c97734",
    "tests/verify-article-preview-browser.mjs": "5b6bff30f231d3e0bb53aadb48d1915b208eeef75d66a3a268c6507391d8030f",
    "tests/verify-article-preview-server.mjs": "a884099b71a59730db52699f61459f7b449f98c535dd40c6cd5d31950077efc9",
    "tests/verify-article-preview-summary.mjs": "055d31d2defa1b12ee5c9ff4b0f868e43ae81c99dd7cd374bdbf9d645b996a58",
    "tests/verify-audit-hardening.mjs": "e205f1578ece6c6016e75fc51c259b737ddfd87a7c784e26e2936fbf2ee0e121",
    "tests/verify-bohemia-progress-browser.mjs": "55456b5309711b68cb005f641d2915e7b5c27bad97bb2376d7616964aef61a03",
    "tests/verify-book-cloud-download-browser.mjs": "716e1e15d2b69995fe7b0c969e1d2807478f7ce804848cbe89aa17bd81a75333",
    "tests/verify-book-cloud-edge.mjs": "3b3dadc38e654a5c006440fbf7a974781dd40f5aceeb6e0f167e01ad10dfa7ad",
    "tests/verify-book-cloud-position-browser.mjs": "46c1495d693e21925b1c5b2ec969ae1aa38a33219e0446ceeee2e15441466685",
    "tests/verify-book-cloud-sql.mjs": "96cda27b1c5311f179b9c470f76e0faff79f7e6488e4806c56d92948e551dbbf",
    "tests/verify-book-cloud.mjs": "339d1a5276b6029a5bb600ddafab017b9ebd1c8d81b4cf8e87f07aef8d536bea",
    "tests/verify-breeze16-browser.mjs": "4f1488e92641f1fac1e22ada5d8cc1ddb972faa50f19fd31f49eb1dc05f2ea7f",
    "tests/verify-casual-rails-browser.mjs": "75484a9a267dcc989148509f9f1186eb8d6035064b68d029ebac7e5c0538ed84",
    "tests/verify-control-optics-browser.mjs": "0233866aab44dcbbede12582d9783ec789cfed34773b7ac1efc29183371d307c",
    "tests/verify-device-polish-browser.mjs": "e07872407c8df8b64fa97fc55166453ef38bf8d7c63ded6181ec407f13b53f5b",
    "tests/verify-dock-pull-browser.mjs": "b5e4375bd60fa34cf5cc7b84e4d6cc8e811a4950116cb80028dc5550199a1592",
    "tests/verify-design-home-browser.mjs": "f394c5a7ca10d65f66ce727c88927959acced087283c200ff3c90e57ef775e3b",
    "tests/verify-design-memory-browser.mjs": "1fad6d7b2a44f1e401fce2d287909d7466bcea88b68461ce41fb5a3004e52331",
    "tests/verify-dict-telemetry.mjs": "d39b79d0a2c48f97678eb24406f4ce099aafa61c576641daa10df1a85d629159",
    "tests/verify-dictionary-account-scope.mjs": "c5ac692c86ee24f752182a7c3e46f23b3eaa23dca9daf28efaa547a16fd36d71",
    "tests/verify-email-login-browser.mjs": "bf52cbccc6f2197dca4c9eb08ff33ceeaa2ccd4ae55a079eaafffda278882207",
    "tests/verify-email-login.mjs": "5f107e6306f58d4057a817bead7a782e50bc0dd64f29c32d41e4e1d687a8cac9",
    "tests/verify-epub-geometry.mjs": "7615d7def2bc9a06ceef8e47267e5c969b8cd3f99c129091f91c977399f87f74",
    "tests/verify-gesture-ownership.mjs": "39cd65f26f275b5fb2705f61b68ebf5b775da7d3c6e02f6930a922c4aaa370d2",
    "tests/verify-header-controls-browser.mjs": "a96b442a4f840a4e320ea70c3322a1105e8abb54fcbf57b3d39d4889ba8b0b71",
    "tests/verify-home-controls-browser.mjs": "011f550d3fc244e51b59f8383518ed1e818261add91e59437ca4b09de3f82982",
    "tests/verify-incremental-word-browser.mjs": "b386ef4d23cb6de424d7b320d2762e94d111fc58a0dd1869126fa8e5fcc58fef",
    "tests/verify-incremental-word-save.mjs": "5ff45c338dd1c10d852b0e0aebca6d0be0c55c82303295cda7de4e7ec6d08b21",
    "tests/verify-ingestion-browser.mjs": "444f5fe67ea55fb2724886ad333892957f35f297e508e1028ee51a49eb770548",
    "tests/verify-ink-sync-browser.mjs": "919c221f31991e003a205f4aa77ddda5f5fbe32b9e7e0aa339ff4bc1dbfe23be",
    "tests/verify-ink-sync-sql.mjs": "c8acfea0c0a587f3b9cfe803a021e3f124531b5624b74760068fad4bd38bd8a7",
    "tests/verify-ink-sync.mjs": "5c2e57a57ae80c24d7acd3fd29a85c2d2eaa76fc83cb1016673df60db962ea17",
    "tests/verify-ios-cloud-build.mjs": "3e68f601b6b6ebd915bf75c5f5173273a00de7f0b443108ebc79709c7a57f12b",
    "tests/verify-learning-sync-sql.mjs": "2e872df5f9364dff26e1263469826663c2c90f1bace91ceade4c79efee5098b7",
    "tests/verify-learning-sync.mjs": "8eea53b910fd3a5948eb295fa2db17f48489a9243d0c415d607ba49812be54f4",
    "tests/verify-library-refresh-browser.mjs": "5c6ffa0801976edc04a6376e447652339cd92cb6970a2a0aca45746a416e9db6",
    "tests/verify-lookup-contract.mjs": "272eb72fc2026aea8285533f81b33e3c380fa5e8d1c141828f2a6246552e596c",
    "tests/verify-lookup-work-browser.mjs": "3ca2e4dddf48cf293c6a3f9daebe29fb59208c86b5371921e67bf45aed846178",
    "tests/verify-memory-edit-filter-browser.mjs": "e7b45b6d9f6ed80b5772ea6401d8b44d5d419de395ff9f73a6303c07d4d071e3",
    "tests/verify-onboarding-study-browser.mjs": "9e6a9bd5c99e6b9b719581a2a096b6fcaae13d92b01bcd016770be8f846d44f7",
    "tests/verify-pdf-ocr-browser.mjs": "c7ae7abc6ae06894eaf75ea663cfc5b9a6ae2110632c8dae92aca013c26fa503",
    "tests/verify-pdf-ocr-cover-browser.mjs": "4d45c95b6504ac3a8db300c239141cb725771c74e3e8463a8353fd65fe2747b7",
    "tests/verify-pdf-ocr-library-browser.mjs": "8844028b904d1af838854be9af46e39429f16c6f9f8eb2ef6e8bd86ef2e7bc5a",
    "tests/verify-pdf-ocr-ipad-shelf-browser.mjs": "849fec6b864d4839053a878e42400d16c1b831f5931efb0ceb951502a71cde52",
    "tests/verify-pdf-ocr-library.mjs": "f4247ddf93f4dca33ed516c7dedbbdfc4eeaa5093015ffbbce60a11337544df8",
    "tests/verify-pdf-ocr-shelf-browser.mjs": "5312a516720efd16899337e0ae07631acb289ef1153f8979a87819d28f82b8ee",
    "tests/verify-pdf-ocr.mjs": "3fea212fabcbec4d05413fe2695006606064bd7fbbb1ba2160bec57556c63f13",
    "tests/verify-pdf-pending-pinch-browser.mjs": "b9036b8f051e3f0cf28989dc5ea4ddb50375af5c4e5183ad1d68113974ae7d19",
    "tests/verify-pdf-pinch-browser.mjs": "328b2af30c9addbb53f5b553084990371ba8ac0d95b4899c37f3cbd387197d26",
    "tests/verify-reader-chrome-motion-browser.mjs": "8da2556083de5998b5f09ea1977fe36986670f62bd196c3629ca3a3433c9c906",
    "tests/verify-reader-native-selection.mjs": "dae04593c8fc9a3acb8ca8cd9c029a84e1423da430bf67d2374950acd157beb9",
    "tests/verify-reader-work-browser.mjs": "db204e3c86ce6ca88402a1196ce71ce181f9e7d923b3ea09f5913c7ce785d807",
    "tests/verify-reading-cache-browser.mjs": "a53c0b65a62c2922ec91364e562f76aff5a4072dc88d77a8a4623c36e83ed496",
    "tests/verify-reading-cache-client.mjs": "ac5e3e7d721c4b143736f208dfd4f773b2e92ce94c1afb64a5a316b12a866070",
    "tests/verify-reading-cache.mjs": "81f245df72518c640ff3aaf36a58395dae798630e1edcc13030f6caadfa838e0",
    "tests/verify-reading-place-browser.mjs": "aa6eb53e8ad58af66cc4982523a91a07e87ecae6619b23d438f1092c98576c6e",
    "tests/verify-reading-place.mjs": "677ba664b25226d18847ea7ea759f02f3334e77a1311b457a4e0f97e22746a01",
    "tests/verify-rss-catalog-hybrid-browser.mjs": "ba4668678085a2412da018a6fa15aa238f82f73c502e76802ae442683a58c6fc",
    "tests/verify-rss-selected-body.mjs": "75936d211c0d1e8028fdcadda12f1d765192982f2e1e85dc54781550e2291f0f",
    "tests/verify-sentence-help-browser.mjs": "a58c923aa985532f2ab16781750f33fe6cf9738b7defb93791f175691bea9a25",
    "tests/verify-share-home-browser.mjs": "bd9e7536a50d428d02454260b97c3eb02391f4a3a7737e18f3c6c1b4adf7ca5a",
    "tests/verify-simple-word-cards-browser.mjs": "a6ad71bbaed4c4428c8b2e363be0eb7968f25c977d2c9fb5c3714126a6de5c00",
    "tests/verify-social-content.mjs": "aa6615a2a9ca6644dc8c49d1810c2356b23d9803e47ce07f1af8bbddcb9a1170",
    "tests/verify-social-import-browser.mjs": "7b437ca75c7790013c14fdde96d07d1ca639aae54a93a3586bb0a777bc374f4a",
    "tests/verify-social-import-server.mjs": "be3b58cc8457569f11af548c748d7643a4b97e9f189a17673ea8fb44aa2df104",
    "tests/verify-social-inline.mjs": "5aeb7647df8327c402a373b60c9849e173590ef046d4c5e2352c7613397081d1",
    "tests/verify-storage-migration-browser.mjs": "7a169595a087f12d117752148527eaff376582af1aed168a09b2cbb8c92dd6de",
    "tests/verify-storage-migration-web.mjs": "c567c6fcc108b5a306eecba6dcde1a05c4a3e705c2c8c23112d36508e764e7dc",
    "tests/verify-storage-migration.mjs": "f6593a7e7a6e9bdcbd233461f482994bfee708bb60bcc7bd5fdd71d56adafeab",
    "tests/verify-storage-quota-browser.mjs": "375645083ef106939a949b774d7e773e4173f0c87851fef765cfb7df204e953e",
    "tests/verify-storage-quota.mjs": "ba84ace85d2e2e26bc6bda10e0b46a07272018104682164c6ebb9ae41166cb72",
    "tests/verify-structure.mjs": "51cc54bf90ec0d88b4e4909a4497938fb098421fc9f4bd89f05199dc154eeb6e",
    "tests/verify-study-account-storage.mjs": "8d435b6b019330aad2c3ac761f8cc37656e0b49d69d1c97d265ed42dd044df54",
    "tests/verify-study-axis-lock-browser.mjs": "9c1b1502107331aef3fe35b4a0ea7968ab5a7c232da2dfc7ecd062db320c0ac5",
    "tests/verify-study-completion-browser.mjs": "8fc6fac3cf17dbe035b36508c9d872d1064bda2e6c5fb8fa48a425a30274c73f",
    "tests/verify-study-create-browser.mjs": "9c1fe4bd0865c1abf7f34fd20a42ed440ebc5c1c2e579f3d89f0545c8a909c6c",
    "tests/verify-study-motion-browser.mjs": "f0985db2b4413d696486d50244c44ca5adc2e0a042d8880c7302d88185244736",
    "tests/verify-study-quota-browser.mjs": "1c92efd027097393ea12ede9d54bada35d21280fb6e0018543f6f0837a3ed25c",
    "tests/verify-study-set-test-grade.mjs": "9fd53eb9a70383c6d79e18aac34cec698c4fba5e314acba6a289ee0f3cc8b662",
    "tests/verify-study-set-test.mjs": "d09884a9908d01d205c8fb25a5a6694ffeda8782248dcb7b08da80a8e9e82757",
    "tests/verify-study-sets-account-merge.mjs": "c25223fdc15c5ab5b2d6e45e4fb082c6746aba8ea47cf83088771a94882fc7b5",
    "tests/verify-study-sets-browser.mjs": "cee77d0dacd1dc8e39840b7506ae040182fd47b6cd6de96209b5437944d266fb",
    "tests/verify-study-sets-storage.mjs": "a828a74ccb5f1e5e2f9a85001b109e3b33755efb343e507644a96b1389bdd766",
    "tests/verify-study-sets-touch-browser.mjs": "c543ed9c5ed0366271c626d1b197a533a9c5996fb6b40ecf897f2c24bff865df",
    "tests/verify-study-sets-ui.mjs": "32aa3e3814d8198fcd2548b118c359710cb7a6cdaf8c0ef39764880d48a64bb2",
    "tests/verify-study-sets.mjs": "31d03b9465c7a10ea4adf713c75342157702eb325562733cbfff1b27265bc116",
    "tests/verify-vocabulary-review-browser.mjs": "26a437ae74d1e115cf836351a78f25b37f3c712284dfac635ffa620543d55253",
    "tests/verify-vocabulary-test-browser.mjs": "bf9a4fa3f04c4dd63d16d4ad3b5c8aa27de0900767597443d1047bd8d55e4769",
    "tests/verify-vocabulary-test-storage.mjs": "cd33119fe82eea784c4216ddaf3ef43a44eb7083e6fe452c9ba0c4aca34a019f",
    "tests/verify-word-arrival-browser.mjs": "7153fe769ecb627747c0d207bc5ec28e603e30f110d611745bb270e3b1463956",
    "tests/verify-word-auth-deadline.mjs": "0384af879b8962c24d1bc1d9adbd58e52b8de8756ba87254729ad38b01529b10",
    "tests/verify-word-lifecycle.mjs": "c5e7bcbf75609b4b7699d68fc8bc7dbc0f7690233aeba14f202259a6798e1be4",
    "tests/verify-word-lemma-validation.mjs": "5451fb10a49344e27b9d5322fe2d18f605ec1e7b835ad4e9d099c3cd44ce8a18",
    "tests/verify-word-lookup-recovery.mjs": "0ccd7846efcd7cd6887ea2d86016771ccf2ea0beebc836e2241cf3221c7b4d0e",
    "tests/verify-word-presentation-browser.mjs": "bc96e45b293a2e5378a8167a76791df9df100c9534a59139a0c0f993784636c9",
    "tests/verify-word-repeat-tap-browser.mjs": "8a62695f4ea352bdb51d96848480000d359b56964eb409a0cee9ba33d0b079a3",
    "tests/verify-word-scroll-idle.mjs": "07ceda12dea6ef429f0598a9a328ccbad3c7fb0702c3f119c5be1cf400c54079",
    "tests/verify-wordbook-patch-sql.mjs": "1c491c30a20e39e616c4877109a53e6339ca4e586cfeb1ce94e6ca71a5dad551",
    "tests/verify-wordbook-window-browser.mjs": "e646141b3b1a4c1748663af41775d5937b20bcbfa7abc2eb21c86f81cf3ad194",
    "tools/ios-testflight.sh": "a4c2fea8bcfaf63f1306e37a1c4491d8ee50197401aab4003b8d93f8c36c1b7d",
    "tools/verify-ios-release.mjs": "d01d93942834e00665706ed57052242c30465848ec6994bf945a3fd370854778",
    "types/globals.d.ts": "0c5a66571dc17dce9639c78486f1be1f879d7bfdfe765f45a9f9cec084d2b657"
};
const runners=[".github/workflows/integrity.yml", ".github/workflows/design-brand.yml", ".github/workflows/social-auth.yml"];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const baseline=new Map(git('ls-tree','-rz',base).toString().split('\0').filter(Boolean).map(line=>{
 const [meta,file]=line.split('\t'),[mode,type,hash]=meta.split(' ');assert.equal(type,'blob');return [file,{mode,hash}];
}));
for(const file of runners)expected[file]=sha(Buffer.from(git('show',base+':'+file).toString().replaceAll('tests/verify-vocabulary-export-boundary.mjs',guard)));
const paths=new Set([...baseline.keys(),...git('ls-files','-z','--cached','--others','--exclude-standard').toString().split('\0').filter(Boolean)]);
const current=new Map([...paths].map(file=>{
 const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Expected regular file: '+file);
 const bytes=readFileSync(join(root,file));return [file,{mode:stat.mode&0o111?'100755':'100644',hash:blob(bytes),sha256:sha(bytes)}];
}));
function verify(entries){
 for(const [file,entry] of entries){
  const before=baseline.get(file);assert.ok(before||Object.hasOwn(expected,file)||file===guard,'Unapproved path: '+file);
  assert.equal(entry.mode,before?.mode||'100644','Mode drift: '+file);
  if(Object.hasOwn(expected,file))assert.equal(entry.sha256,expected[file],'Approved source changed: '+file);
  else if(file!==guard)assert.equal(entry.hash,before.hash,'Source outside approved scope changed: '+file);
 }
 for(const file of [...baseline.keys(),...Object.keys(expected),guard])assert.ok(entries.has(file),'Missing source: '+file);
}
git('merge-base','--is-ancestor',base,'HEAD');verify(current);
assert.match(readFileSync(join(root,'scripts/core/vocabulary-test.js'),'utf8'),/const ENABLED=false;/);
assert.match(readFileSync(join(root,'scripts/dictionary/vocabulary-test-grading.js'),'utf8'),/const VOCABULARY_TEST_REMOTE_ENABLED=false;/);
assert.match(readFileSync(join(root,'server/dict/vocabulary-test.ts'),'utf8'),/const VOCABULARY_TEST_GRADING_ENABLED = false;/);
for(const file of ['scripts/reader/pdf-original.js','ios/App/App.xcodeproj/project.pbxproj','package.json','tests/verify-vocabulary-export-boundary.mjs',...runners]){
 const changed=new Map(current);changed.set(file,{...changed.get(file),hash:'0'.repeat(40),sha256:'0'.repeat(64)});assert.throws(()=>verify(changed),/changed/);
}
const unknown=new Map(current);unknown.set('unapproved.js',{mode:'100644',hash:''});assert.throws(()=>verify(unknown),/Unapproved/);
const executable=new Map(current);executable.set(guard,{...executable.get(guard),mode:'100755'});assert.throws(()=>verify(executable),/Mode drift/);
const missing=new Map(current);missing.delete('scripts/reader/pdf-original.js');assert.throws(()=>verify(missing),/Missing/);
const scratch=mkdtempSync(join(tmpdir(),'breeze-next-export-'));let registered=false;
try{
 git('worktree','add','--quiet','--detach',scratch,historicalBase);registered=true;
 execFileSync(process.execPath,['tests/verify-vocabulary-export-boundary.mjs'],{cwd:scratch,stdio:'inherit'});
}finally{if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});}
console.log('Exact approved integration/account-learning source passed; native release and disabled grading/historical gates remain protected.');
