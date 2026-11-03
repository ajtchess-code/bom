export type RoomRow={
  id:string; guild_id:string; name:string; text_channel_id:string; voice_channel_id:string;
  controller_message_id:string|null; preferred_worker_id:string|null; language:string|null;
  autoplay:boolean; delete_requests:boolean; skip_mode:string|null; default_filter:string; enabled:boolean;
};
