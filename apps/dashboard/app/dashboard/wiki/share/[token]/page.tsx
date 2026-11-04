import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import Link from "next/link";
async function get(path: string) {
  const r = await internalFetch(path);
  if (r.status === 401 || r.status === 403) redirect("/?auth=member");
  if (!r.ok) return null;
  return r.json();
}
export default async function SharedWikiAnswer({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await get(`/v1/wiki/shared/${encodeURIComponent(token)}`);
  if (!data?.answer) redirect("/dashboard/wiki");
  const a = data.answer;
  return (
    <div className="wikiStandalone">
      <section className="panel wikiAnswer confirmed">
        <div className="wikiAnswerHead">
          <div>
            <span className="cardKicker">SHARED WIKI ANSWER</span>
            <h1>{a.question}</h1>
            <small>{new Date(a.created_at).toLocaleString()}</small>
          </div>
        </div>
        <p>{a.answer}</p>
        {a.data?.scenarioTable?.length > 0 && (
          <div className="wikiScenario">
            <table>
              <thead>
                <tr>
                  <th>Sell price</th>
                  <th>After tax</th>
                  <th>Profit / unit</th>
                </tr>
              </thead>
              <tbody>
                {a.data.scenarioTable.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>{r.salePrice}</td>
                    <td>{r.afterTax}</td>
                    <td>{r.profitPerUnit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="wikiAnswerActions">
          <Link className="goldButton" href="/dashboard/wiki">
            Open Wiki
          </Link>
          {a.entity_key && (
            <Link
              className="outlineButton"
              href={`/dashboard/wiki/article/${encodeURIComponent(a.entity_key)}`}
            >
              Open article
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
