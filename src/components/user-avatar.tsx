import * as React from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar.tsx";
import { getGravatarUrl } from "@/lib/utils.tsx";

// Emails without a Gravatar. Other avatars skip the request until the next
// clear, so a user who adds a Gravatar sees it within 15 minutes.
const missingGravatars = new Set<string>();

setInterval(
  () => {
    missingGravatars.clear();
  },
  1000 * 60 * 15,
);

export const UserAvatar = React.memo(function UserAvatar(props: {
  username: string;
  email: string;
  className?: string;
}) {
  // Keyed by email, so a changed email loads its own avatar.
  const [failedEmail, setFailedEmail] = React.useState<string>();
  const failed =
    failedEmail === props.email || missingGravatars.has(props.email);

  return (
    <Avatar className={props.className}>
      {!failed && (
        <AvatarImage
          onLoadingStatusChange={(status) => {
            if (status === "error") {
              missingGravatars.add(props.email);
              setFailedEmail(props.email);
            }
          }}
          src={getGravatarUrl(props.email)}
          alt={props.username}
        />
      )}
      <AvatarFallback>
        {props.username.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
});
