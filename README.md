# 我们的回忆录 · Our Memory

给情侣 / 挚友 / 家人做的一个**纯本地**回忆网站：记录认识时长、照片墙、时光轴、纪念日、共同清单、日记、每日一问，还能一键生成纪念卡。

没有服务器、没有账号、不联网上传任何东西 —— 所有数据只存在你自己的浏览器里。

---

## 一、怎么打开

**最简单：双击 `index.html`**（推荐 Chrome / Edge）即可使用。

**更稳妥：用本地服务器打开**（`file://` 下部分浏览器会禁用 IndexedDB，照片会退化为存在 localStorage 里，容量较小）：

```bash
# 在本文件夹里执行任选其一
python -m http.server 8080
npx serve .
```

然后浏览器访问 `http://localhost:8080`。

> 注意：换端口或换目录会变成「另一个站点」，数据不共享。长期使用请固定在同一个地址打开（把网址存成书签）。

## 二、文件结构

```
index.html        页面骨架（所有视图都在这一页里）
styles.css        4 套主题 + 全部样式（含移动端适配）
js/content.js     文案库：100 件小事、100 个问题、情话、关系文案
js/store.js       存储层：IndexedDB（照片）+ localStorage（文字），含降级方案
js/app.js         核心：路由 / 首页 / 相册 / 灯箱 / 设置 / 备份
js/more.js        时光轴 / 纪念日 / 清单 / 日记 / 每日一问 / 统计 / 纪念卡
```

无需安装、无需构建、无外部依赖（不引用任何 CDN），断网也能用。

## 三、第一次用，先做这三件事

1. 左侧导航 → **设置**
   - **关系**：恋人 / 挚友 / 家人 —— 切换后全站文案和配色会跟着变（「在一起第 N 天」↔「认识第 N 天」）
   - **起始日期**：你们认识（或在一起）的那一天，首页计时器从这天开始算
   - **双方名字 / 头像**：名字会出现在首页标题和纪念卡上
   - **主题**：奶油粉 / 复古手账 / 清爽文艺 / 暗夜
2. 回到**首页**，右上角「＋ 记录」可以直接加照片、写里程碑、写日记、加清单
3. 想先看看长什么样：设置里有「**生成示例数据**」，会造几张渐变图和一串记录，随时可清空

## 四、功能一览

| 模块 | 能做什么 |
| --- | --- |
| 首页 | 天数 / 时 / 分 / 秒实时跳动；下次纪念日倒数；那年今天；每日情话；小统计 |
| 相册 | 拖拽或点选上传（自动压缩 1600px + 缩略图 480px）；瀑布流；收藏；日期 / 标题；灯箱支持 ← → 键与手机滑动；编辑、删除 |
| 时光轴 | 记下「第一次一起旅行」这类时刻，可关联一张照片，自动标注「第 N 天」 |
| 纪念日 | 100/200/365/520/730/1000/1314… 天自动算好；自定义支持每年 / 每月 / 仅一次，按剩余天数排序 |
| 一起做的事 | 内置 100 件小事清单（已勾选进度环），可增删、筛选「未完成 / 已完成」 |
| 日记 | 心情 + 天气 + 正文，同一天再写会更新那一天的记录 |
| 每日一问 | 100 个越来越深的问题，随机抽未答的，答案永久留存（一年就是一本采访录） |
| 统计 | 一起走了多远、照片 / 里程碑 / 日记数量、近一年记录热力图、近 12 个月照片柱状、内容分布环图 |
| 纪念卡 | Canvas 生成 900×1440 竖版纪念卡（照片 + 天数 + 情话），可换图、下载 PNG |
| 云端共享 | 填 Supabase 地址 + key + 共享码，两台设备双向同步文字与照片（可选，不填就是纯本地） |
| 设置 | 主题、身份、PIN 锁（4 位数字，仅防窥不是加密）、JSON 备份导入导出、清空数据 |

## 五、数据存在哪里

- **照片原图与缩略图** → IndexedDB，数据库名 `ourmemory`，表 `photos`
- **设置 / 时光轴 / 纪念日 / 清单 / 日记 / 问答** → localStorage，键名前缀 `ourmemory.`

所以：

- 清除浏览器「Cookie 和网站数据」会**清掉这些记录**（就像清掉聊天记录一样）
- 换浏览器、换电脑、换端口 → 看到的是空白（不同站点不共享存储）
- 无痕窗口关掉就没了

**一定要养成备份的习惯。**

## 六、备份与迁移

- **导出**：设置 → 「导出备份」，得到一个 `.json` 文件（照片以 base64 一起打包，会比较大，几百张照片约几十 MB 属正常）
- **迁移到新电脑**：把整个文件夹拷过去 → 打开 → 设置 → 「导入备份」选择那个 json → 照片和文字全部恢复
- 定期导出一份放到网盘，是最省心的方案

## 七、小提示

- 照片是按「几百张」设计的：首屏只渲染 24 张，滚动到底自动加载下一批，缩略图懒加载，所以不会一次卡死
- 上传时自动压缩长边到 1600px，画质 0.85 —— 既能全屏看，又不会把存储塞满。想保留原图请另存原始文件
- 起始日期填未来日期也没关系，天数会显示 0
- 用打印（Ctrl/Cmd + P）可以导出一份纯文字的「回忆小册子」
- 手机浏览器打开同一局域网地址也能用，但手机上添加的照片不会自动同步到电脑（各存各的），同步请用备份文件

## 八、可以自己改的地方

- `js/content.js`：把 100 件小事、100 个问题、情话换成你们自己的
- `styles.css` 顶部的 `html[data-theme="…"]` 变量块：改 `--accent` 就是改全站主色
- 想加新模块：在 `index.html` 里加一个 `<section id="view-xxx" class="view" hidden>`，再在 `js/more.js` 里 `APP.register('xxx', 渲染函数)` 即可

---

祝你们有很多很多值得记下的日子。

---

# 附：部署到 GitHub Pages（让朋友打开一个网址就能看）

> 部署后拿到的网址长这样：`https://你的用户名.github.io/我们的回忆录/`（仓库名用英文更稳，例如 `our-memory`）
> 注意：**免费账号的仓库必须是 Public 才能开 Pages**。这个仓库里只有代码，没有任何你们的照片和日记（数据在各自浏览器里），所以公开也不泄露隐私。

## 方案 A：直接在网页上传（不用装任何东西）

1. 打开 <https://github.com/new> → Repository name 填 `our-memory` → 选 **Public** → Create repository
2. 在新页面点 **uploading an existing file**
3. 把本文件夹里的 **`index.html`、`styles.css`、`README.md`、`.gitignore`、`.nojekyll`** 和整个 **`js` 文件夹**拖进去（`PLAN.md` 不用传）→ Commit changes
4. 仓库页 → **Settings** → 左侧 **Pages** → Source 选 **Deploy from a branch** → Branch 选 **main** + **/(root)** → Save
5. 等 1～2 分钟刷新 Pages 页面，会出现 `Your site is live at https://用户名.github.io/our-memory/`，把这个链接发给朋友即可

## 方案 B：用命令行（本文件夹已经 `git init` 并提交好了）

先在 GitHub 建一个空仓库（同上，**不要**勾选 Add README），然后在文件夹里执行：

```bash
# 换成你自己的名字和邮箱（只影响提交记录）
git config user.name "你的名字"
git config user.email "你的邮箱"

# 把 origin 换成你自己的仓库地址
git remote add origin https://github.com/你的用户名/our-memory.git
git branch -M main
git push -u origin main
```

推送完成后，去仓库 **Settings → Pages → Deploy from a branch → main / (root) → Save**，等 1～2 分钟即可。

> 提交记录里的作者目前是占位符 `Our Memory`，想改成本人：先执行上面的 `git config`，再 `git commit --amend --reset-author --no-edit && git push -f`。

## 以后想改内容再更新

```bash
git add -A && git commit -m "改了点东西" && git push
```

推送后 Pages 1 分钟左右自动重新发布，刷新网页（Ctrl/Cmd+Shift+R 强制刷新）就能看到新版。

## 三个必须知道的坑

1. **部署 ≠ 数据同步**。朋友打开你的网址，看到的是**她浏览器里的空白数据**，她添加的照片存在她的设备上。想真正共用一份相册，得接后端（Supabase 之类），否则只能靠「导出备份 JSON → 发对方 → 对方导入」手动合并。
2. **数据跟“站点”绑定**。`https://你.github.io/our-memory/`、`http://localhost:8080`、本地双击 `file://` 是三个不同的站点，各自一份数据，互不相通。选定一个地址长期用，别换来换去。
3. **GitHub Pages 上的数据也有风险**。清浏览器数据 / 换设备 / 无痕窗口都会丢，所以：设置 → 导出备份，定期存一份到网盘。

> 想让两人真的共用一份内容？看下一节。

---

# 附：云端共享（两人真正同步）

上面的 Pages 只是把**网页**发出去，数据仍在各自的浏览器里。要做成「她加的照片我也能看到」，需要一块免费的后端。这里用 **Supabase**（免费额度：1GB 文件存储 + 500MB 数据库，够存 1500～2500 张压缩后的照片）。

代码已经写好了（`js/cloud.js`），你只需要做三件事：建项目 → 跑一段 SQL → 填三个输入框。

## 1. 建项目

1. 打开 <https://supabase.com> → Sign up（可以直接用 GitHub 账号登录）
2. **New project**：Name 随便（如 `lxy-memory`）、Database Password 随便设一个（后面用不到，但请记下）、Region 选 **Southeast Asia (Singapore)** 或离你近的
3. 等 1～2 分钟，项目创建完成

## 2. 跑一段 SQL（建表 + 建照片桶）

左侧 **SQL Editor** → **New query** → 粘贴下面整段 → 右下角 **Run**（显示 `Success. No rows returned` 就对了）：

```sql
-- ① 一份 JSON 文档装所有文字内容
create table if not exists public.spaces (
  id text primary key,
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.spaces enable row level security;

drop policy if exists "anon all" on public.spaces;
create policy "anon all" on public.spaces
  for all to anon, authenticated using (true) with check (true);

-- ② 照片存储桶（public = 图片能用直链打开）
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

-- ③ 桶权限
drop policy if exists "photos read" on storage.objects;
drop policy if exists "photos insert" on storage.objects;
drop policy if exists "photos update" on storage.objects;
drop policy if exists "photos delete" on storage.objects;
create policy "photos read"   on storage.objects for select to anon, authenticated using (bucket_id = 'photos');
create policy "photos insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'photos');
create policy "photos update" on storage.objects for update to anon, authenticated using (bucket_id = 'photos');
create policy "photos delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'photos');
```

## 3. 抄两个值

左侧 **Settings（齿轮）→ API Keys**（老版叫 API）：

| 界面上叫 | 填到哪里 |
| --- | --- |
| **Project URL**（`https://xxxx.supabase.co`） | 网页里「项目 URL」 |
| **anon / public** 那个长 `eyJ...` 的 key | 网页里「anon public key」 |

⚠️ 别用 `service_role` key —— 那个等于数据库管理员密码。

## 4. 网页里连上

打开你的网址 → **设置 → 云端共享**：

1. 粘贴上面两个值
2. 点 **随机生成** 得到一个共享码（如 `our-x7k2m9pq`）
3. 点 **连接并同步** —— 第一次会把本地已有的照片一起传上去，稍等

然后让 TA 打开**同一个网址**，填**同样的三项**，点「连接并同步」，两边内容就会一样了。

## 同步是怎么工作的

- 每次改动后约 1 秒自动上传；此外每 15 秒自动拉一次，切回标签页时也会立刻拉
- 合并规则：**按每一条内容的修改时间取新的**，所以两人各加各的都会保留
- 删除也会同步（内部用“墓碑”记录，不会被对方那边又合并回来）
- 主题、PIN 密码、云端配置属于**每台设备自己**的，不会被对方覆盖
- 照片：原图（压缩到 1600px）+ 缩略图（480px）各传一份；别人传的图用云端直链显示，不占本地空间

## 需要注意

1. **共享码就是钥匙**。知道「项目地址 + anon key + 共享码」的人就能看到内容，所以共享码别用 `our-520` 这种（用「随机生成」）。
2. **免费项目 7 天没人访问会被暂停**，网页就会同步失败；回 Supabase 控制台点 **Restore / Resume** 即可，数据不会丢。
3. **同一秒两人改同一条**，以最后保存的为准；改不同的内容则都会保留。
4. 导出备份（设置 → 数据 → 导出）仍然建议定期做，云端不是网盘。
