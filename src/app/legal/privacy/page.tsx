import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Maverick Command Center",
  description: "Privacy Policy for Maverick Command Center",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-[#8b949e] mb-8">Last updated: March 2, 2026</p>

      <div className="space-y-6 text-[#c9d1d9] leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">1. Introduction</h2>
          <p>
            Maverick Exteriors (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or
            &quot;our&quot;), located in Kansas City, Kansas, operates the Maverick Command Center
            application (&quot;Application&quot;). This Privacy Policy describes how we collect, use,
            store, and protect information when you use the Application and its integrations with
            third-party services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">2. Information We Collect</h2>
          <p>We collect the following types of information through the Application:</p>

          <h3 className="text-lg font-medium text-[#e6edf3] mt-4 mb-2">
            a. Business Data from Integrations
          </h3>
          <p>
            When you connect third-party services, the Application accesses and stores business
            data including:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>
              <strong>QuickBooks:</strong> Financial data including invoices, payments, expenses,
              account balances, and transaction records
            </li>
            <li>
              <strong>JobNimbus:</strong> Customer contacts, job records, estimates, invoices, and
              activity history
            </li>
            <li>
              <strong>OpenPhone:</strong> Call and text message logs, phone numbers, and
              communication timestamps
            </li>
            <li>
              <strong>Roofle:</strong> Roof quote submissions, property information, and lead data
            </li>
          </ul>

          <h3 className="text-lg font-medium text-[#e6edf3] mt-4 mb-2">
            b. Usage Data
          </h3>
          <p>
            We may collect information about how you interact with the Application, including pages
            visited, features used, and access timestamps.
          </p>

          <h3 className="text-lg font-medium text-[#e6edf3] mt-4 mb-2">
            c. Authentication Data
          </h3>
          <p>
            We collect OAuth tokens and credentials necessary to maintain connections with
            third-party services. These are stored securely and used solely for the purpose of
            accessing authorized data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">3. How We Use Information</h2>
          <p>We use collected information to:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Display business metrics, dashboards, and reports within the Application</li>
            <li>Synchronize data between connected third-party services</li>
            <li>Calculate sales performance, pipeline, and revenue metrics</li>
            <li>Track lead response times and conversion rates</li>
            <li>Generate financial reports and reconciliation data</li>
            <li>Improve and maintain the Application</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">4. Data Storage and Security</h2>
          <p>
            Business data is stored in a secured Supabase PostgreSQL database with row-level
            security policies. OAuth tokens and API keys are stored as encrypted environment
            variables. We implement industry-standard security measures including:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Encrypted data transmission (HTTPS/TLS)</li>
            <li>Secure credential storage via environment variables</li>
            <li>Access controls and authentication requirements</li>
            <li>Regular security reviews of integrations and data access</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">5. Data Sharing</h2>
          <p>
            We do not sell, rent, or trade your personal or business information to third parties.
            Data may be shared in the following limited circumstances:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>
              <strong>Service providers:</strong> With hosting (Vercel), database (Supabase), and
              infrastructure providers necessary to operate the Application
            </li>
            <li>
              <strong>Connected integrations:</strong> Data flows between third-party services you
              have authorized (e.g., syncing between QuickBooks and the dashboard)
            </li>
            <li>
              <strong>Legal requirements:</strong> When required by law, regulation, or legal
              process
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">6. Third-Party Services</h2>
          <p>
            The Application integrates with third-party services that have their own privacy
            policies. We encourage you to review them:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Intuit QuickBooks: https://www.intuit.com/privacy/statement/</li>
            <li>JobNimbus: https://www.jobnimbus.com/privacy-policy</li>
            <li>OpenPhone: https://www.openphone.com/privacy</li>
            <li>Supabase: https://supabase.com/privacy</li>
            <li>Vercel: https://vercel.com/legal/privacy-policy</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">7. Data Retention</h2>
          <p>
            We retain business data for as long as your account is active and the third-party
            integrations remain connected. You may request deletion of your data at any time by
            contacting us. Upon disconnecting a third-party integration, we will cease accessing new
            data from that service. Previously synced data may be retained for historical reporting
            purposes unless you request deletion.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">8. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Access the data we have collected about you or your business</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Disconnect third-party integrations at any time</li>
            <li>Revoke OAuth access tokens for any connected service</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">
            9. Changes to This Privacy Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be posted on this page
            with an updated revision date. Continued use of the Application after changes
            constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">10. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or our data practices, contact us at:
          </p>
          <p className="mt-2">
            Maverick Exteriors<br />
            Kansas City, Kansas<br />
            Phone: 913-268-6052
          </p>
        </section>
      </div>
    </div>
  );
}
