export const metadata = {
  title: "Privacy Policy · 咩咩~嗷呜",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-gray-800 dark:text-gray-200">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-10">Effective date: April 16, 2026</p>

      <section className="space-y-4 mb-10">
        <p>Miemie ~ Aowu ("we", "our", or "us") operates the website <strong>miemieaowu.ai</strong> and the iOS app <strong>咩咩嗷呜</strong>. This policy explains what information we collect, how we use it, and your choices.</p>
      </section>

      <Section title="1. Information We Collect">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Account information:</strong> username, optional display name, optional phone number, and a hashed password. We do not collect your email address.</li>
          <li><strong>Content you create:</strong> lists, items, comments, reactions, and photos you upload.</li>
          <li><strong>Photos:</strong> images you take with your camera or select from your photo library are uploaded to and stored on our servers. We only access your camera or library when you explicitly tap the photo button.</li>
          <li><strong>Usage data:</strong> standard server logs (IP address, request path, timestamp) retained for up to 30 days for debugging and security.</li>
        </ul>
      </Section>

      <Section title="2. How We Use Your Information">
        <ul className="list-disc pl-5 space-y-2">
          <li>To provide, operate, and improve the app.</li>
          <li>To authenticate you and keep your session secure (HTTP-only cookie, 1-year TTL).</li>
          <li>When you use the AI features (word challenge login, bulk import), the text you submit is sent to a third-party language model API (OpenRouter) for processing. We do not store your prompts beyond the immediate request.</li>
          <li>When you use the photo search feature, your search query is sent to Serper (Google Images API). We do not store search queries.</li>
        </ul>
      </Section>

      <Section title="3. Data Storage">
        <p>Your data is stored on Cloudflare infrastructure (D1 database, R2 object storage) distributed globally. Photos are served from our domain and are not publicly indexed.</p>
      </Section>

      <Section title="4. Data Sharing">
        <p>We do not sell your personal information. We share data only with the following service providers who help operate the app:</p>
        <ul className="list-disc pl-5 space-y-2 mt-2">
          <li><strong>Cloudflare</strong> — hosting, database, and file storage</li>
          <li><strong>OpenRouter</strong> — language model API for AI features</li>
          <li><strong>Serper</strong> — image search (only when you use the search feature)</li>
        </ul>
      </Section>

      <Section title="5. Content Visibility">
        <p>Lists you mark as <strong>public</strong> are visible to unauthenticated visitors on the homepage. Lists marked <strong>private</strong> are only visible to you and users you explicitly share them with. You can change visibility at any time.</p>
      </Section>

      <Section title="6. Your Rights">
        <ul className="list-disc pl-5 space-y-2">
          <li>You can delete any item, photo, or list you have created at any time within the app.</li>
          <li>To request deletion of your account and all associated data, contact us at the email below.</li>
        </ul>
      </Section>

      <Section title="7. Children">
        <p>This app is not directed at children under 13. We do not knowingly collect personal information from children under 13.</p>
      </Section>

      <Section title="8. Changes">
        <p>We may update this policy from time to time. The effective date at the top of this page will reflect the most recent update. Continued use of the app after changes constitutes acceptance of the updated policy.</p>
      </Section>

      <Section title="9. Contact">
        <p>Questions about this policy? Email us at: <a href="mailto:hi@miemieaowu.ai" className="text-[#2B4B8C] underline">hi@miemieaowu.ai</a></p>
      </Section>

      <hr className="my-12 border-gray-200 dark:border-gray-700" />

      {/* Chinese version */}
      <h1 className="text-3xl font-bold mb-2">隐私政策</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-10">生效日期：2026年4月16日</p>

      <section className="space-y-4 mb-10">
        <p>咩咩~嗷呜（以下简称"我们"）运营网站 <strong>miemieaowu.ai</strong> 及 iOS 应用 <strong>咩咩嗷呜</strong>。本政策说明我们收集哪些信息、如何使用，以及您的选择权利。</p>
      </section>

      <Section title="1. 我们收集的信息">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>账户信息：</strong>用户名、可选的显示名称、可选的手机号，以及加密存储的密码。我们不收集电子邮件地址。</li>
          <li><strong>您创建的内容：</strong>清单、项目、评论、表情反应及您上传的照片。</li>
          <li><strong>照片：</strong>您通过相机拍摄或从相册选择的图片会上传并存储至我们的服务器。仅当您主动点击照片按钮时，我们才会访问相机或相册。</li>
          <li><strong>使用数据：</strong>标准服务器日志（IP 地址、请求路径、时间戳），保留不超过 30 天，用于调试和安全目的。</li>
        </ul>
      </Section>

      <Section title="2. 信息的使用方式">
        <ul className="list-disc pl-5 space-y-2">
          <li>用于提供、运营和改进应用。</li>
          <li>用于身份验证和保持会话安全（HTTP-only Cookie，有效期 1 年）。</li>
          <li>当您使用 AI 功能（咩~ 登录挑战、AI 批量导入）时，您提交的文本会被发送至第三方语言模型 API（OpenRouter）进行处理。我们不会在请求结束后存储您的提示内容。</li>
          <li>当您使用图片搜索功能时，搜索词会被发送至 Serper（Google 图片 API）。我们不存储搜索词。</li>
        </ul>
      </Section>

      <Section title="3. 数据存储">
        <p>您的数据存储在 Cloudflare 的全球基础设施上（D1 数据库、R2 对象存储）。照片通过我们自己的域名提供，不会被公开索引。</p>
      </Section>

      <Section title="4. 数据共享">
        <p>我们不出售您的个人信息。仅在以下协助运营应用的服务提供商之间共享数据：</p>
        <ul className="list-disc pl-5 space-y-2 mt-2">
          <li><strong>Cloudflare</strong> — 托管、数据库及文件存储</li>
          <li><strong>OpenRouter</strong> — AI 功能所用的语言模型 API</li>
          <li><strong>Serper</strong> — 图片搜索（仅在您使用该功能时）</li>
        </ul>
      </Section>

      <Section title="5. 内容可见性">
        <p>您设为<strong>公开</strong>的清单会在首页对未登录用户可见。设为<strong>私密</strong>的清单仅您本人及您主动分享的用户可见。您可随时修改可见性设置。</p>
      </Section>

      <Section title="6. 您的权利">
        <ul className="list-disc pl-5 space-y-2">
          <li>您可随时在应用内删除您创建的任何项目、照片或清单。</li>
          <li>如需删除账户及所有相关数据，请通过以下邮件联系我们。</li>
        </ul>
      </Section>

      <Section title="7. 儿童隐私">
        <p>本应用不面向 13 岁以下儿童。我们不会在知情情况下收集 13 岁以下儿童的个人信息。</p>
      </Section>

      <Section title="8. 政策变更">
        <p>我们可能不时更新本政策。页面顶部的生效日期将反映最新更新时间。继续使用应用即表示您接受更新后的政策。</p>
      </Section>

      <Section title="9. 联系我们">
        <p>对本政策有疑问？请发送邮件至：<a href="mailto:hi@miemieaowu.ai" className="text-[#2B4B8C] underline">hi@miemieaowu.ai</a></p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="text-gray-700 dark:text-gray-300 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
