import type { RequestEventBase } from "@builder.io/qwik-city";
import { server$ } from "@builder.io/qwik-city";
import type { reactionroles, levels, level_rewards } from "@prisma/client";
import { prisma } from '~/root';
import type { APIGuild, APIRole, APIGuildChannel, ChannelType, RESTError, RESTRateLimit, APIUser } from "discord-api-types/v10";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Guild extends APIGuild {
  id: string;
  mutual: boolean;
}

export interface guildData {
  guild: Guild;
  channels: APIGuildChannel<ChannelType>[];
  roles: APIRole[];
  srvconfig: settings;
  reactionroles: reactionroles[];
  level_rewards: level_rewards[];
}

interface joinleaveMessage {
  message: string;
  channel: string;
}

interface ticketData {
  logChannel: string;
  categories: {
    open: string;
    closed: string;
  }
  supportRole: string;
  message: string;
  transcripts: string;
}

export interface joinleaveImage {
  backgroundColor: string;
  image: string;
  textColor: string;
  shadow: string;
  shadowColor: string;
}

export interface memberCount {
  channel: string;
  text: string;
}

export interface counting {
  channel: string;
  count: number;
  countmax: number;
}

export interface settings {
  guildId: string;
  leavemessage: joinleaveMessage;
  leaveimage: joinleaveImage;
  joinmessage: joinleaveMessage;
  joinimage: joinleaveImage;
  ticketdata: ticketData
  membercount: memberCount;
  wishlistchannel: string;
  counting: counting;
  ticketId: number;
}

export interface embedData {
  sendChannel: string;
  title: string;
  description: string;
  color: string;
  footer: string;
  thumbnail: string;
  image: string;
  buttonText: string;
}

export type AnyGuildChannel = APIGuildChannel<ChannelType>;

export const sendEmbedFn: any = server$(async function (embedData: embedData) {
  const res = await fetch(`https://discord.com/api/v10/channels/${embedData.sendChannel}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bot ${this.env.get("BOT_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      embeds: [
        {
          title: embedData.title ?? undefined,
          description: embedData.description ?? undefined,
          color: parseInt(embedData.color.replace("#", ""), 16) ?? undefined,
          footer: {
            text: embedData.footer ?? undefined,
          },
          thumbnail: {
            url: embedData.thumbnail ?? undefined,
          },
          image: {
            url: embedData.image ?? undefined,
          },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: embedData.buttonText ? embedData.buttonText : "Create Ticket",
              custom_id: "ticket_create",
            },
          ],
        },
      ],
    }),
  }).catch(() => null);

  if (!res) throw new Error(`Failed to send embed`);

  const data: RESTError | RESTRateLimit | any = await res.json();
  if ("retry_after" in data) {
    console.log(`${data.message}, retrying after ${data.retry_after * 1000}ms`);
    await sleep(data.retry_after * 1000);
    return await sendEmbedFn(embedData);
  }
  if ("code" in data) throw new Error(`Send embed error ${data.code}`);
});

export const getGuildDataFn = server$(async function (props: RequestEventBase): Promise<guildData | Error> {
  props = props ?? this;

  const guildId = props.params.guildId;
  try {
    const [guild, channels, roles, srvconfig, reactionroles, level_rewards] = await Promise.all([
      fetchData(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, props),
      fetchData(`https://discord.com/api/v10/guilds/${guildId}/channels`, props),
      fetchData(`https://discord.com/api/v10/guilds/${guildId}/roles`, props),
      prisma.settings.findUnique({ where: { guildId } }),
      prisma.reactionroles.findMany({ where: { guildId } }),
      prisma.level_rewards.findMany({ where: { guildId } }),
    ]);

    channels.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
    roles.sort((a: { position: number }, b: { position: number }) => b.position - a.position);

    const parsedSrvConfig = srvconfig
      ? {
        ...srvconfig,
        joinmessage: JSON.parse(srvconfig.joinmessage),
        joinimage: JSON.parse(srvconfig.joinimage),
        leavemessage: JSON.parse(srvconfig.leavemessage),
        leaveimage: JSON.parse(srvconfig.leaveimage),
        wishlistchannel: JSON.parse(srvconfig.wishlistchannel),
        membercount: JSON.parse(srvconfig.membercount),
        counting: JSON.parse(srvconfig.counting),
        ticketdata: JSON.parse(srvconfig.ticketdata),
      }
      : {
        guildId,
        joinmessage: {
          message: "",
          channel: "false",
        },
        joinimage: {
          backgroundColor: "#0d0d0d",
          image: "",
          textColor: "#f0ccfb",
          shadow: "true",
          shadowColor: "#7c4b8b",
        },
        leavemessage: {
          message: "",
          channel: "false",
        },
        leaveimage: {
          backgroundColor: "#000000",
          image: "",
          textColor: "#ffffff",
          shadow: "true",
          shadowColor: "#000000",
        },
        wishlistchannel: "",
        membercount: {
          channel: "false",
          text: "Members: {COUNT}",
        },
        counting: {
          channel: "false",
          count: 0,
          countmax: 0,
        },
        ticketdata: {
          logChannel: "false",
          categories: {
            open: "false",
            closed: "false",
          },
          supportRole: "false",
          message: "false",
          transcripts: "false",
        },
        ticketId: 0,
      };

    return { guild, channels, roles, srvconfig: parsedSrvConfig, reactionroles, level_rewards };
  } catch (error: any) {
    return new Error(`Failed to fetch guild data: ${error.message}`);
  }
});

export const getLeaderboardFn = server$(async function (props: RequestEventBase): Promise<levels[]> {
  props = props ?? this;
  const levels = await prisma.levels.findMany({
    where: { guildId: props.params.guildId },
    orderBy: { level: 'desc' },
    take: 100,
  });

  return levels;
});

export const getUserInfoFn = server$(async function (accessToken: string): Promise<APIUser | Error> {
  const user = await fetchData("https://discord.com/api/v10/users/@me", this, true, accessToken) as APIUser;
  return user;
});

export const updateSettingFn = server$(async function (
  name: string,
  value: string | number | boolean | null | undefined
) {
  const guildId = this.params.guildId;
  try {
    console.log(`Updating setting ${name} to ${value}`);
    await prisma.settings.update({
      where: { guildId },
      data: { [name]: value },
    });
  } catch (error: any) {
    throw new Error(`Failed to update setting: ${error.message}`);
  }
});

export const deleteLevelRewardFn = server$(async function (level: number) {
  const guildId = this.params.guildId;
  try {
    await prisma.level_rewards.delete({
      where: { guildId_level: { guildId, level } },
    });
  } catch (error: any) {
    throw new Error(`Failed to delete level reward: ${error.message}`);
  }
});

export const updateLevelRewardFn = server$(async function (rewardInfo: level_rewards) {
  const guildId = this.params.guildId;
  try {
    await prisma.level_rewards.upsert({
      where: { guildId_level: { guildId, level: rewardInfo.level } },
      update: rewardInfo,
      create: { ...rewardInfo, guildId },
    });
  } catch (error: any) {
    throw new Error(`Failed to update level reward: ${error.message}`);
  }
})

export async function fetchData(url: string, props: RequestEventBase, user?: boolean, accessToken?: string): Promise<any> {

  const res = await fetch(url, {
    headers: {
      authorization: `${user ? `Bearer ${accessToken}` : `Bot ${props.env.get("BOT_TOKEN")}`}`,
    },
  }).catch((err: any) => {
    console.log(err)
  });
  if (!res) throw new Error(`Fetch failed for ${url}`);

  const data: RESTError | RESTRateLimit | any = await res.json();
  if ("retry_after" in data) {
    console.log(`${data.message}, retrying after ${data.retry_after * 1000}ms`);
    await sleep(data.retry_after * 1000);
    return await fetchData(url, props);
  }
  if ("code" in data) throw new Error(`${url} error ${data.code}`);

  return data;
}
