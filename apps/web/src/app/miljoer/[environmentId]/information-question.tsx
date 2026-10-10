/**
 * PS-ENV-019: the administrators' question to an applicant, verbatim, with
 * who it is from. It belongs to the application, not to private chat.
 */
export function InformationQuestion({
  from,
  question,
}: {
  from: string;
  question: string;
}) {
  return (
    <dl className="facts">
      <dt>{from}</dt>
      <dd className="message-text">«{question}»</dd>
    </dl>
  );
}
