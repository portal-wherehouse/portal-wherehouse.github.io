import { PageHero, Section, FeatureCards, SiteLink, PortalCTA } from '../kit';
import '../pilot.css';
export function CustomersPage() {
  return <>
    <div className="site-inner"><PageHero eyebrow="Pilot program" title="Prove it on a real shift."
      lede="We are seeking a construction-material warehouse that stages pallets by job. Customer results will be published only after a real pilot and with permission."><SiteLink to="contact" className="site-btn primary">Discuss your warehouse</SiteLink><PortalCTA /></PageHero></div>
    <Section tone="surface" title="Is your warehouse a fit?" lede="A useful first pilot has several active jobs, labeled storage locations, and a crew willing to record each movement.">
      <FeatureCards items={[
        {icon:'jobs', title:'Material belongs to a job', body:'Fixtures, equipment or supplies wait in a warehouse until a project needs them.'},
        {icon:'pin', title:'Finding it takes effort', body:'Staff rely on paper, spreadsheets or a colleague’s memory to locate each pallet.'},
        {icon:'scanner', title:'A scan can fit the shift', body:'A phone or scanner is available at receiving and wherever pallets move.'},
      ]} />
    </Section>
    <Section eyebrow="Simulation only" title="Practice with Northfield Builders."
      lede="Northfield Builders is a fictional sample warehouse, not a customer. Use its jobs and racks to rehearse receiving, placement, movement, dispatch and returns.">
      <ol className="pilot-steps"><li>Receive lighting fixtures against the school-renovation job.</li><li>Print the pallet label, then place it at A-03-02.</li><li>Move it to B-01-01 and find it by job.</li><li>Dispatch it, record a return and place it again.</li><li>Review the history and check what happens when a move is missed.</li></ol>
      <p>The portal’s Settings page includes a practice-shift checklist. The advanced test tools simulate conflicts and lost responses. These checks establish software behavior, not customer adoption or time savings.</p><PortalCTA />
    </Section>
    <Section tone="surface" title="What a real pilot must measure">
      <div className="pilot-table-wrap"><table className="pilot-table"><thead><tr><th>Measure</th><th>How to check it</th></tr></thead><tbody>
        <tr><td>Retrieval time</td><td>Time comparable searches before and during the pilot.</td></tr>
        <tr><td>Location accuracy</td><td>Compare recorded racks with physical pallet locations.</td></tr>
        <tr><td>Missed movements</td><td>Observe moves and count how many were recorded.</td></tr>
        <tr><td>Training effort</td><td>Watch a new operator complete the workflow without coaching.</td></tr>
        <tr><td>Willingness to pay</td><td>Ask whether the measured improvement justifies the proposed monthly price.</td></tr>
      </tbody></table></div>
      <p>Live shared-device trials are pending the production backend. For now, explore the sample workflow and discuss a pilot scope.</p>
      <SiteLink to="contact" className="site-btn primary">Talk about a pilot</SiteLink>
    </Section>
  </>;
}
