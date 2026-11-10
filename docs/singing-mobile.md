# 移动练唱面板（2026-10-18）

## 已迁入的功能

列表页右下 FAB 栈增加 🎤，按需加载练唱面板。使用原生 HTML dialog：焦点留在面板、Escape／关闭按钮退出、关闭后回到触发按钮。手机全屏，桌面居中；适配 393×852 CSS 像素（iPhone 15），使用 `100dvh` 和 safe-area inset。

当前八首歌：不如跳舞、开到荼蘼、我不难过、舞娘、夜的第七章、如詩一般的形容妳、想到我们、银河。当前句逐字高亮、点阵时长、下一句倒计时及两句预览、伴奏拍点、目标音／人声音高、最近 8 秒曲线和参考覆盖、历史回看、变速移调、原唱／伴奏切换、暂停总结和诊断均迁入。暂停继续保留数据；切歌、重置、关闭面板清除本次记录。页面进入后台／收到原生中断事件时暂停，返回后由用户继续。关闭会销毁播放器、worklet、worker、麦克风流和临时回放 URL。

播放时自动将手机视图定位到演唱区；播放／暂停、重置和回到第一句固定在底部。设置默认折叠；图形缩放移到曲线后的折叠项。更长的歌词与记录仍可滚动查看，没有把手机界面缩成桌面小字截图。

本地后续布局调整：手机展开设置使用紧凑横排，缩小段间距；滑块触摸区域与细轨道分离，避免整块背景变成粗条。升降调按钮固定 44×44，不再被最小高度拉成长椭圆。这部分尚未重新发布线上。

超过 12 字的当前／下一句会增加歌词卡高度，避免两行文字及点阵覆盖下一张卡；这时音高图可能需要稍向下滚动。

## 模块与资源

- `src/features/singing`：从 prototype 复制的独立模块，import 使用该目录命名空间。
- `src/components/SingingFAB.tsx`：列表入口；`SingingPanel.tsx` 管理 modal 生命周期。
- `studio.css`：原样式限定到 `.singing-panel`，放入 CSS layer；`mobile.css` 覆盖移动布局，不修改宿主应用全局样式。
- `public/singing/media`、`public/singing/worklets`：资源独立路径，无 localhost 或原 repo 运行依赖。
- 伴奏 WAV 转成 192 kbps AAC / M4A，减少移动下载体积；原曲 M4A、LRC、F0、拍点与字级参考保持字节不变。八首歌曲运行资源合计约 95 MiB，每个文件小于 25 MiB。Web Audio 仍完整下载并解码当前歌曲，弱网首次加载和长歌曲解码内存是现有边界；不会预加载全部曲库。
- `predev`／`prebuild` 从锁定的 SoundTouch 包复制处理器及许可证。
- `docs/singing-architecture.md` 是迁移时的技术说明快照，其中 prototype 路径／历史评估数字按原记录保留；本文件说明 app 内实际部署差异。

原 `/Users/chundong/work/ai-live-band` 保持运行版本不变。迁移前完整源码、脚本、参考和媒体快照：`/Users/chundong/work/cadence-snapshots/cadence-before-miemie-20261018.tar`。`singing-source-manifest.json` 保存迁入源模块的 SHA-256；它描述基线，不是移动版修改后的哈希。

## iOS：AVAudioSession 配置＋Web Audio 回退

`SingingAudioPlugin.swift` 是实际注册的 Capacitor 本地插件，`SingingBridgeViewController` 通过 Main storyboard 启动并注册；两个文件加入 App target，Info.plist 加入麦克风用途说明。

`configure` 在收音前配置 `.playAndRecord` / `.default` / `.allowBluetoothA2DP` / `.defaultToSpeaker`，请求内置麦克风，读取 `currentRoute`；**不启用 HFP，也不承诺强制保持某条蓝牙路径**。WebKit 启动 capture 后再次 `status`，以实际系统路径显示输入／输出及 inputLatency、outputLatency、IOBufferDuration。route-change 通知清除旧校准；interruption 通知暂停练唱。关闭面板恢复插件接管之前的 category、mode、options 并停用本次 session。

本版本只是原生 session 管理，**不是 AVAudioEngine 采集／播放引擎**。PCM、F0 worker、SoundTouch、采样时间和评分仍由 Web Audio 实现。WebKit 可能重新配置共享 session，必须用 AirPods＋iPhone 实机检查最终路由。原生插件不存在（网页、旧 App、Android）或配置失败时，自动保留现有网页音频路径，界面说明兼容模式。Android 当前仓库没有工程，未实现 Oboe。

系统延迟仅作为诊断估计显示，**不与已有 Web Audio 回录测量叠加，也不作为精确节奏评分校准**。仍可使用已有声学回录／人工实测延迟。浏览器模式不会伪装成原生模式；未测量的延迟不会填入猜测值。默认不做麦克风耳返，麦克风 PCM 不上传、不持久化。

## 离线处理与发布

原型曲库预计 10–20 首，使用 Workers Static Assets，暂不引入歌曲 R2 bucket 或 D1 曲库表。`public/singing` 经 OpenNext 进入 `.open-next/assets/singing`，随 Worker 部署；线上资源路径仍为 `/singing/media/...`。新增歌曲需要重新发布应用。已有照片／视频 R2 binding 不用于练唱曲库。歌曲文件为静态公开资源，曲库入口仍在登录后的列表页。

每个静态文件不得超过 25 MiB，导入脚本在发布清单前检查；约 95 MiB 是当前八首资源的总大小，不是单文件大小。音频和所有参考按同一版本一起发布，回滚 Worker 版本时也回滚对应静态资源；原始录音和模型缓存留在离线工作目录。规模增长或增加用户上传时再迁移到 R2。

`tools/singing-offline` 携带 preparation services、分离／参考提取／Beat This／SOFA 字级对齐／performance 发布脚本及审阅模板，路径自包含。模型、Python 环境、原始干声缓存和 staging 输出不加入 Git，不依赖原 prototype 的虚拟环境。

安装一次（模型下载需联网）：

```sh
cd tools/singing-offline
sh scripts/setup-song-preparation.sh
sh scripts/setup-lyric-alignment.sh
.audio-venv/bin/python scripts/prepare-recorded-song.py --help
```

按照 help 提供音频、LRC、song-id、标题，使用 `--align-lyrics` 生成字级参考；先审阅再发布。曲库歌曲已经带有参考，不需要为启动 App 重新跑模型。新的 staging 曲库与 App 曲库分离，导入时按 ID 合并，保留已有歌曲。

审阅脚本生成 staging HTML 后，在 `tools/singing-offline` 执行 `python3 -m http.server 4300 --directory apps/web/public`，按脚本给出的本地链接查看。它不依赖旧 prototype 的 3000 端口。

```sh
# 从 app repo 根目录执行。ffmpeg 可在 PATH，也可显式传入路径。
npm run singing:publish -- --ffmpeg /absolute/path/to/ffmpeg
# 也支持导入其他按相同协议生成的目录：
npm run singing:publish -- --source /absolute/path/to/prepared-workspace --ffmpeg /absolute/path/to/ffmpeg
```

发布脚本先验证原曲、LRC、reference 与 performance 的 SHA-256 关联，再转码伴奏、复制资源，最后原子更新曲库清单。不会改变原始参考时间戳；不会因为转成移动格式重新对齐。失败不发布新曲库清单；素材由本机处理。

## 验证和运行

- `npm run test:singing`：时间映射／五探针校准、暂停恢复记录、曲线范围、歌词、参考带、音准与节奏独立评分、背景音回放等回归测试。
- `npx tsc --noEmit`：宿主＋迁移模块类型检查。
- `npm run dev` 后 `/dev/singing` 是不依赖账号的本地 FAB 预览；生产环境返回 404。正式入口仍在登录后的列表页。
- `npm run ios:sync`，在 Xcode 构建 App；仅发布网页不能为已经安装的旧 App 增加 Swift 插件，旧版本会走兼容模式。
- Capacitor production server 仍是仓库原有的 `https://miemieaowu.ai`，网页已于 2026-10-18 发布到 Cloudflare；原生插件仍需重建 iOS App。手机开发时把 development server URL 配到可达的开发机地址；iPhone 上的 localhost 不是 Mac。

本机只有 Command Line Tools，无完整 Xcode，因此未声称通过 iOS 编译或真实 AirPods 延迟测量。需要实机验收：连接耳机→开启收音→确认实际输入输出→暂停恢复→切换设备→来电→关闭重开；验证无遗留麦克风、旧校准被清除、没有耳返，以及 Safari 和 WKWebView 的 AudioWorklet 支持。

本次验证：45 项回归测试通过、1 项跳过；TypeScript 和 Next.js 生产构建通过。发布脚本实际导入 5 首歌并验证参考 provenance；39 个迁入源模块与原项目基线哈希一致。393×852 浏览器验证了 FAB 打开／关闭、焦点恢复、跳到第一句、播放逐字高亮、暂停总结及切歌。麦克风在浏览器自动化验证中关闭，真实收音和 iOS 路由不计入已验证项目。Swift 语法解析和 Xcode 工程 plist 检查通过，未做 iOS SDK 编译。

## 原生设计来源

- [Capacitor：本地 iOS 插件和注册](https://capacitorjs.com/docs/ios/custom-code)
- [Apple：录放 session 中的 A2DP 输出](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/allowbluetootha2dp)
- [Apple：首选输入与实际 currentRoute](https://developer.apple.com/documentation/avfaudio/avaudiosession/preferredinput)
- [Apple：输入延迟](https://developer.apple.com/documentation/avfaudio/avaudiosession/inputlatency)
- [WebKit #282939：开启录音时的路由变化](https://bugs.webkit.org/show_bug.cgi?id=282939)

## 本次 Cloudflare 发布记录

2026-10-18：OpenNext Worker 构建、Wrangler dry-run 及本地生产资源检查通过，35 项曲库资源与源文件一致，开发预览路由在生产返回 404。Cloudflare 已发布版本 `5c7f5c31-c464-4a40-be86-37f44b0f52a8`，此前版本 `25eed722-4c71-4e58-a9f3-99b964a69a84`。用户随后要求优先本地试用；暂停后续线上操作，线上端到端播放尚未验收。本地预览为 `http://localhost:4200/dev/singing`。

## 2026-10-18 本地新增：如詩一般的形容妳

歌曲 ID `ru-shi-yi-ban-de-xing-rong-ni`，原曲时长 266.900 秒。使用迁入的 `prepare-recorded-song.py --align-lyrics` 完成 Demucs 分离、pYIN／周期性／CREPE 参考音高融合、Beat This 拍点和 SOFA 字级对齐，再用发布脚本合并到 App 本地曲库。此次复用原 prototype 的 Python 环境，模型及中间产物保存在本仓库 `tools/singing-offline/private-audio`；未改动原 prototype。

32 句歌词共 353 字已生成时间数据，包含 6,713 帧可用字级音高参考、349 个拍点。完整性及 provenance 校验通过；原有五首曲目和 35 个资源的 SHA-256 保持不变。模型时间尚未人工审听确认，完整性校验不代表音乐准确性。该阶段仅加入本地；已随下文 2026-10-18 正式发布上线。

### 新歌导入的歌词兼容修正

- SOFA 推理继续使用非空歌词行；发布 alignment/performance 时，行号映射回完整 LRC（包括空白过门提示），窗口及字级行号一起映射，缓存推理结果不变。修复空白前奏导致后续逐字高亮全部回退到句级时间的问题。
- 导入时剔除首段明确的歌名／歌手卡及制作人员字段（冒号格式），最多扫描开头 60 秒，遇到第一句演唱歌词立即停止。原始下载 LRC 不修改；规范化策略写入处理缓存键，避免复用旧的未清理歌词包。
- `python3 tools/singing-offline/scripts/test-lyric-line-indices.py` 覆盖空白前奏／过门映射与片头制作名单；`validate-following-library.py` 逐字检查对应 LRC 行与字符内容，阻止行号错位数据通过验证。

## 2026-10-18 本地新增：想到我们

歌曲 ID `xiang-dao-wo-men`，原曲时长 306.155 秒。使用同一离线流程生成去原唱伴奏、35 句／298 字时间数据、7,010 帧可用字级音高参考与 399 个拍点。开头 22 条歌名／制作名单已从运行 LRC 中剔除，首句为「天外又发现 行星多一颗」；用户下载的原始文件不变。两首新歌的数据完整性与逐字行号检查均通过。此时本地共 7 首，原有五首未改变；这两首新歌后续已随下文正式发布上线。

本地浏览器验证（393×852）：《如詩一般的形容妳》《想到我们》可切换、播放去原唱伴奏，逐字歌词／拍点提示和目标音随时间更新，暂停进入总结。验证时关闭麦克风，未将自动化播放验证计为真实收音或模型准确性验证。

## 2026-10-18 本地新增：银河

歌曲 ID `yin-he`，原曲时长 301.140 秒。生成去原唱伴奏、68 句／448 字时间数据、7,846 帧可用字级音高参考与 339 个拍点；片头两条词曲署名已剔除，保留原始下载文件。三首新歌通过数据完整性、音频／歌词／参考来源关联以及逐字行号检查；原有五首曲目与 35 个资源哈希不变。本地共 8 首，静态资源约 94.7 MiB，最大单文件约 8.2 MiB。新增三首后续已随下文正式发布上线。

《银河》也已在 393×852 本地浏览器验证选歌、伴奏播放、字级歌词／拍点提示及暂停总结（收音关闭）；截图见 `singing-yin-he-preview.png`。新增数据仍是模型估计，未经逐句人工准确性验收。

## 2026-10-18 正式发布：八首曲库与移动布局

按用户要求部署到现有 Cloudflare Worker `miemie-aowu-webapp`，生产入口 `https://miemieaowu.ai`，上游 `cf-origin.miemieaowu.ai`。新版本 `c834e113-b80e-4021-8b36-13467753eb5f`；上一版本 `5c7f5c31-c464-4a40-be86-37f44b0f52a8` 可用于回滚。包含紧凑移动控制布局、八首曲库与默认歌曲《如詩一般的形容妳》。

发布前 Next.js／TypeScript／OpenNext Worker 构建通过，45 项前端回归测试通过、1 项跳过，2 项离线歌词兼容测试通过。八首歌曲全部 56 个资产与生产构建一致，音频、LRC、音高参考的 provenance 校验通过。此次只发布 Web Worker 与静态资源；没有执行数据库迁移，也没有构建或发布新的 iOS 二进制。

上线后通过正式域名检查 62 个资源全部通过：56 个歌曲资源可访问，新增歌曲资源、练唱前端 chunk、worklet 和 BUILD_ID 与本次构建哈希一致。`/login` 返回 200，开发预览 `/dev/singing` 返回 404。浏览器确认正式登录页可达；因验证浏览器未登录，未执行登录后的线上演唱／收音端到端验收。
