import { Megaphone } from 'lucide-react';

type OfficialReplyProps = {
  readonly reply: string;
  readonly repliedAt?: string | null;
};

export function OfficialReply({ reply, repliedAt }: OfficialReplyProps) {
  return <div className="p-4 bg-blue-50/80 dark:bg-blue-950/50 rounded-xl space-y-1 mt-2">
    <div className="font-bold text-blue-900 dark:text-blue-300 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5"><Megaphone aria-hidden="true" className="size-4 shrink-0" /> 學權組官方回覆：</span>
      {repliedAt && <span className="text-xs text-blue-600 dark:text-blue-400 font-normal">{new Date(repliedAt).toLocaleDateString()}</span>}
    </div>
    <p className="text-blue-950 dark:text-neutral-200 text-sm whitespace-pre-line break-words">{reply}</p>
  </div>;
}
