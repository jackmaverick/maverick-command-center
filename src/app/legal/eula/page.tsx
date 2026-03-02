import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "End-User License Agreement - Maverick Command Center",
  description: "End-User License Agreement for Maverick Command Center",
};

export default function EULAPage() {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-2">End-User License Agreement</h1>
      <p className="text-[#8b949e] mb-8">Last updated: March 2, 2026</p>

      <div className="space-y-6 text-[#c9d1d9] leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">1. Agreement to Terms</h2>
          <p>
            This End-User License Agreement (&quot;EULA&quot;) is a legal agreement between you
            (&quot;User&quot;) and Maverick Exteriors (&quot;Company&quot;), located in Kansas City,
            Kansas, for the use of the Maverick Command Center application
            (&quot;Application&quot;), including any associated services, integrations, and data
            connections.
          </p>
          <p className="mt-2">
            By accessing or using the Application, you agree to be bound by the terms of this EULA.
            If you do not agree to these terms, do not use the Application.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">2. License Grant</h2>
          <p>
            The Company grants you a limited, non-exclusive, non-transferable, revocable license to
            access and use the Application solely for internal business purposes related to Maverick
            Exteriors operations. This license does not include the right to:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Modify, distribute, or create derivative works based on the Application</li>
            <li>Reverse engineer, decompile, or disassemble the Application</li>
            <li>Use the Application for any unlawful purpose</li>
            <li>Share access credentials with unauthorized parties</li>
            <li>Use the Application to compete with Maverick Exteriors</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">3. Third-Party Integrations</h2>
          <p>
            The Application connects to third-party services including but not limited to QuickBooks
            (Intuit), JobNimbus, Supabase, and OpenPhone. By using the Application, you acknowledge
            that:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>
              Third-party services are subject to their own terms of service and privacy policies
            </li>
            <li>
              The Company is not responsible for the availability or accuracy of third-party services
            </li>
            <li>
              Data shared with third-party services is governed by their respective privacy policies
            </li>
            <li>
              You authorize the Application to access and synchronize data from connected
              third-party accounts on your behalf
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">4. Data Ownership</h2>
          <p>
            You retain ownership of all data you input into or generate through the Application. The
            Company retains ownership of the Application itself, including all code, design, and
            proprietary algorithms. The Company may use anonymized, aggregated data for the purpose
            of improving the Application.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">5. Disclaimer of Warranties</h2>
          <p>
            THE APPLICATION IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
            WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED
            WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            THE COMPANY DOES NOT WARRANT THAT THE APPLICATION WILL BE UNINTERRUPTED, ERROR-FREE, OR
            FREE OF HARMFUL COMPONENTS.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">6. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY BE
            LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
            INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING OUT OF OR
            IN CONNECTION WITH YOUR USE OF THE APPLICATION.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">7. Termination</h2>
          <p>
            This EULA is effective until terminated. The Company may terminate this agreement at any
            time without notice if you fail to comply with any term of this EULA. Upon termination,
            you must cease all use of the Application. Provisions regarding data ownership,
            limitation of liability, and governing law survive termination.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">8. Governing Law</h2>
          <p>
            This EULA shall be governed by and construed in accordance with the laws of the State of
            Kansas, without regard to its conflict of law provisions. Any disputes arising under this
            agreement shall be resolved in the courts of Wyandotte County, Kansas.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">9. Changes to This Agreement</h2>
          <p>
            The Company reserves the right to modify this EULA at any time. Changes will be
            effective upon posting to this page. Continued use of the Application after changes
            constitutes acceptance of the modified terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#e6edf3] mb-3">10. Contact Information</h2>
          <p>
            If you have questions about this EULA, contact us at:
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
