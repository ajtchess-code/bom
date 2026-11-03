package org.bandofmisfits.bridge;

import com.google.gson.*;
import org.bukkit.*;
import org.bukkit.command.*;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.java.JavaPlugin;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.File;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

public final class BOMCraftBridge extends JavaPlugin {
 private final Gson gson=new Gson();
 private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
 private YamlConfiguration state;
 private File stateFile;
 private boolean polling=false;
 private URI endpoint;
 private String secret;
 private final Map<UUID,Long> linkCooldown=new ConcurrentHashMap<>();
 @Override public void onEnable(){
  saveDefaultConfig();secret=getConfig().getString("secret","");
  try{endpoint=URI.create(getConfig().getString("endpoint",""));if(!"https".equals(endpoint.getScheme())||endpoint.getUserInfo()!=null||secret.length()<32)throw new IllegalArgumentException();}catch(Exception e){getLogger().severe("Configure an HTTPS endpoint and a secret of at least 32 characters. Bridge disabled.");getServer().getPluginManager().disablePlugin(this);return;}
  stateFile=new File(getDataFolder(),"journal.yml");state=YamlConfiguration.loadConfiguration(stateFile);
  long ticks=Math.max(10,getConfig().getLong("poll-seconds",30))*20;
  getServer().getScheduler().runTaskTimerAsynchronously(this,this::poll,40,ticks);
 }
 private synchronized void saveJournal() throws Exception {
  Path temporary=stateFile.toPath().resolveSibling("journal.tmp");Files.writeString(temporary,state.saveToString(),StandardCharsets.UTF_8);
  try{Files.move(temporary,stateFile.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}catch(AtomicMoveNotSupportedException e){Files.move(temporary,stateFile.toPath(),StandardCopyOption.REPLACE_EXISTING);}
 }
 private JsonObject send(String op,JsonObject payload) throws Exception {
  JsonObject envelope=new JsonObject();envelope.addProperty("op",op);envelope.addProperty("timestamp",System.currentTimeMillis());envelope.addProperty("nonce",UUID.randomUUID().toString());envelope.add("payload",payload);
  String encoded=gson.toJson(envelope);Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
  JsonObject request=new JsonObject();request.addProperty("envelope",encoded);request.addProperty("signature",HexFormat.of().formatHex(mac.doFinal(encoded.getBytes(StandardCharsets.UTF_8))));
  HttpResponse<String> response=http.send(HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(25)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(gson.toJson(request))).build(),HttpResponse.BodyHandlers.ofString());
  JsonObject body=JsonParser.parseString(response.body()).getAsJsonObject();if(response.statusCode()!=200)throw new IllegalStateException(body.has("message")?body.get("message").getAsString():"Dashboard returned "+response.statusCode());return body;
 }
 private <T> T main(Callable<T> task) throws Exception {return getServer().getScheduler().callSyncMethod(this,task).get(15,TimeUnit.SECONDS);}
 private synchronized void poll(){if(polling)return;polling=true;try{
  JsonObject payload=new JsonObject();payload.add("status",main(this::serverStatus));
  JsonArray results=main(()->{JsonArray values=new JsonArray();if(state.isConfigurationSection("jobs"))for(String id:state.getConfigurationSection("jobs").getKeys(false)){if(values.size()>=30)break;if(state.getBoolean("jobs."+id+".pending"))values.add(JsonParser.parseString(state.getString("jobs."+id+".result")));}return values;});
  payload.add("results",results);JsonObject reply=send("poll",payload);
  main(()->{for(JsonElement e:results)state.set("jobs."+e.getAsJsonObject().get("id").getAsString()+".pending",false);saveJournal();return true;});
  if(reply.has("jobs"))for(JsonElement item:reply.getAsJsonArray("jobs")){JsonObject job=item.getAsJsonObject();main(()->{execute(job);return true;});}
 }catch(Exception e){getLogger().warning("Dashboard sync: "+e.getMessage());}finally{polling=false;}}
 private JsonObject serverStatus(){
  JsonObject status=new JsonObject();status.addProperty("online",getServer().getOnlinePlayers().size());status.addProperty("maxPlayers",getServer().getMaxPlayers());status.addProperty("version",getServer().getVersion());status.addProperty("maintenance",state.getBoolean("maintenance"));status.addProperty("currencyName",getConfig().getString("currency-name","BOM Coins"));status.addProperty("economyAvailable",economy()!=null);
  try{status.add("tps",gson.toJsonTree(getServer().getClass().getMethod("getTPS").invoke(getServer())));status.add("mspt",gson.toJsonTree(getServer().getClass().getMethod("getAverageTickTime").invoke(getServer())));}catch(Exception ignored){}
  JsonArray worlds=new JsonArray();for(World w:getServer().getWorlds()){JsonObject v=new JsonObject();v.addProperty("name",w.getName());v.addProperty("players",w.getPlayers().size());worlds.add(v);}status.add("worlds",worlds);
  JsonArray players=new JsonArray();for(Player p:getServer().getOnlinePlayers()){JsonObject v=new JsonObject();v.addProperty("uuid",p.getUniqueId().toString());v.addProperty("name",p.getName());v.addProperty("online",true);v.addProperty("playtimeMinutes",p.getStatistic(Statistic.PLAY_ONE_MINUTE)/1200);players.add(v);}status.add("players",players);
  JsonArray plugins=new JsonArray();for(var p:getServer().getPluginManager().getPlugins()){JsonObject v=new JsonObject();v.addProperty("name",p.getName());v.addProperty("version",p.getDescription().getVersion());v.addProperty("enabled",p.isEnabled());plugins.add(v);}status.add("plugins",plugins);
  JsonArray catalogue=new JsonArray();var section=getConfig().getConfigurationSection("catalogue");if(section!=null)for(String id:section.getKeys(false)){var s=section.getConfigurationSection(id);if(s==null)continue;JsonObject v=new JsonObject();v.addProperty("id",id);v.addProperty("name",s.getString("name",id));v.addProperty("material",s.getString("material"));v.addProperty("amount",s.getInt("amount",1));v.addProperty("price",s.getDouble("price"));catalogue.add(v);}status.add("catalogue",catalogue);
  JsonArray auctions=new JsonArray();var a=state.getConfigurationSection("auctions");if(a!=null)for(String id:a.getKeys(false)){if(!"ACTIVE".equals(a.getString(id+".status")))continue;ItemStack item=a.getItemStack(id+".item");if(item==null)continue;JsonObject v=new JsonObject();v.addProperty("id",id);v.addProperty("name",item.getType().name());v.addProperty("amount",item.getAmount());v.addProperty("seller",a.getString(id+".sellerName"));v.addProperty("price",a.getDouble(id+".price"));auctions.add(v);}status.add("auctions",auctions);status.add("backup",backupStatus());return status;
 }
 private JsonObject backupStatus(){JsonObject r=new JsonObject();String path=getConfig().getString("backup-marker","");try{Path p=Path.of(path);if(path.isBlank()||!Files.isRegularFile(p)){r.addProperty("state","not_configured");}else{r.addProperty("state","marker_present");r.addProperty("lastModified",Files.getLastModifiedTime(p).toInstant().toString());}}catch(Exception e){r.addProperty("state","unavailable");}return r;}
 private void execute(JsonObject job) throws Exception {
  String id=job.get("id").getAsString(),prefix="jobs."+id;String previous=state.getString(prefix+".state","");
  if("COMPLETE".equals(previous)){state.set(prefix+".pending",true);saveJournal();return;}
  JsonObject result=new JsonObject();result.addProperty("id",id);JsonObject data=new JsonObject();
  if("PROCESSING".equals(previous)){result.addProperty("ok",false);result.addProperty("error","Execution interrupted. Review the server journal; automatic replay is blocked.");}
  else{
   state.set(prefix+".state","PROCESSING");saveJournal();
   try{JsonObject payload=job.getAsJsonObject("payload");switch(job.get("kind").getAsString()){
    case "WHITELIST" -> {UUID uuid=UUID.fromString(payload.get("uuid").getAsString());getServer().getOfflinePlayer(uuid).setWhitelisted(true);data.addProperty("message","Whitelist enabled");}
    case "ANNOUNCE" -> {String message=payload.get("message").getAsString();getServer().broadcastMessage("[BOM] "+message);data.addProperty("message","Announcement sent");}
    case "MAINTENANCE" -> {state.set("maintenance",payload.get("enabled").getAsBoolean());data.addProperty("message","Maintenance notice updated");}
    case "BACKUP_STATUS" -> data=backupStatus();
    case "PURCHASE" -> data=purchase(payload,false);
    case "AUCTION_BUY" -> data=purchase(payload,true);
    default -> throw new IllegalArgumentException("Unsupported server action");
   }result.addProperty("ok",true);result.add("result",data);}catch(Exception e){result.addProperty("ok",false);result.addProperty("error",String.valueOf(e.getMessage()));}
  }
  state.set(prefix+".state","COMPLETE");state.set(prefix+".result",gson.toJson(result));state.set(prefix+".pending",true);saveJournal();
 }
 @SuppressWarnings({"unchecked","rawtypes"}) private Object economy(){try{Class<?> type=Class.forName("net.milkbowl.vault.economy.Economy");RegisteredServiceProvider<?> registration=getServer().getServicesManager().getRegistration((Class)type);return registration==null?null:registration.getProvider();}catch(Exception e){return null;}}
 private void money(Object economy,String action,OfflinePlayer player,double amount) throws Exception {
  Class<?> api=Class.forName("net.milkbowl.vault.economy.Economy");Object result=api.getMethod(action,OfflinePlayer.class,double.class).invoke(economy,player,amount);
  if(!(Boolean)result.getClass().getMethod("transactionSuccess").invoke(result))throw new IllegalStateException("Economy transaction failed");
 }
 private JsonObject purchase(JsonObject payload,boolean auction) throws Exception {
  Object economy=economy();if(economy==null)throw new IllegalStateException("Vault economy provider is unavailable");
  Player player=getServer().getPlayer(UUID.fromString(payload.get("uuid").getAsString()));if(player==null)throw new IllegalArgumentException("Player must be online to receive the item");
  String itemId=payload.get("itemId").getAsString();if(!itemId.matches("[A-Za-z0-9_-]{1,80}"))throw new IllegalArgumentException("Invalid item ID");String prefix=(auction?"auctions.":"catalogue.")+itemId;ItemStack item;double price;OfflinePlayer seller=null;
  if(auction){if(!"ACTIVE".equals(state.getString(prefix+".status")))throw new IllegalStateException("Auction is no longer available");seller=getServer().getOfflinePlayer(UUID.fromString(state.getString(prefix+".seller")));if(seller.getUniqueId().equals(player.getUniqueId()))throw new IllegalArgumentException("You cannot buy your own listing");item=state.getItemStack(prefix+".item");price=state.getDouble(prefix+".price");}
  else{var s=getConfig().getConfigurationSection(prefix);if(s==null)throw new IllegalArgumentException("Catalogue item not found");Material material=Material.matchMaterial(s.getString("material",""));if(material==null||material.isAir())throw new IllegalArgumentException("Invalid catalogue material");int amount=s.getInt("amount",1);if(amount<1||amount>material.getMaxStackSize())throw new IllegalArgumentException("Catalogue amount must fit one stack");item=new ItemStack(material,amount);price=s.getDouble("price");}
  if(item==null||!Double.isFinite(price)||price<0||price>1e12)throw new IllegalArgumentException("Invalid item or price");if(player.getInventory().firstEmpty()<0)throw new IllegalStateException("Free an inventory slot before buying");
  if(auction){state.set(prefix+".status","PROCESSING");saveJournal();}
  boolean withdrawn=false,paid=false;try{money(economy,"withdrawPlayer",player,price);withdrawn=true;if(seller!=null){money(economy,"depositPlayer",seller,price);paid=true;}player.getInventory().addItem(item.clone());if(auction){state.set(prefix+".status","SOLD");state.set(prefix+".buyer",player.getUniqueId().toString());saveJournal();}}
  catch(Exception e){if(withdrawn&&!paid){money(economy,"depositPlayer",player,price);if(auction){state.set(prefix+".status","ACTIVE");saveJournal();}}throw e;}
  JsonObject r=new JsonObject();r.addProperty("message","Item delivered");r.addProperty("price",price);return r;
 }
 @Override public boolean onCommand(CommandSender sender,Command command,String label,String[] args){
  if(command.getName().equalsIgnoreCase("bomlink")){
   if(!(sender instanceof Player player)){sender.sendMessage("Account verification must be run by the logged-in player. Pre-whitelist verified first-time users through the console.");return true;}
   if(!getServer().getOnlineMode()&&!getConfig().getBoolean("trusted-proxy-offline-mode",false)){sender.sendMessage("Account linking is disabled until trusted proxy identity forwarding is configured.");return true;}
   if(args.length!=1||!args[0].matches("(?i)[A-F0-9]{12}")){sender.sendMessage("Usage: /bomlink CODE (from the dashboard)");return true;}
   long now=System.currentTimeMillis();if(now-linkCooldown.getOrDefault(player.getUniqueId(),0L)<10000){sender.sendMessage("Please wait before trying another link code.");return true;}linkCooldown.put(player.getUniqueId(),now);
   JsonObject payload=new JsonObject();payload.addProperty("code",args[0].toUpperCase());payload.addProperty("uuid",player.getUniqueId().toString());payload.addProperty("name",player.getName());sender.sendMessage("Verifying account…");
   getServer().getScheduler().runTaskAsynchronously(this,()->{String response;try{send("link",payload);response="Account linked. Refresh your dashboard.";}catch(Exception e){response="Link failed: "+e.getMessage();}String message=response;getServer().getScheduler().runTask(this,()->player.sendMessage(message));});return true;
  }
  if(command.getName().equalsIgnoreCase("bomauction")){
   if(!(sender instanceof Player p))return true;if(args.length!=2||!args[0].equalsIgnoreCase("sell")){p.sendMessage("Usage: /bomauction sell PRICE");return true;}
   if(economy()==null){p.sendMessage("Economy provider unavailable.");return true;}
   try{double price=Double.parseDouble(args[1]);if(!Double.isFinite(price)||price<=0||price>1e12)throw new IllegalArgumentException("Invalid price");ItemStack item=p.getInventory().getItemInMainHand();if(item.getType().isAir())throw new IllegalArgumentException("Hold the item you want to list");String id=UUID.randomUUID().toString(),prefix="auctions."+id;
    state.set(prefix+".status","ESCROWING");state.set(prefix+".item",item.clone());state.set(prefix+".seller",p.getUniqueId().toString());state.set(prefix+".sellerName",p.getName());state.set(prefix+".price",price);saveJournal();p.getInventory().setItemInMainHand(new ItemStack(Material.AIR));state.set(prefix+".status","ACTIVE");saveJournal();p.sendMessage("Auction listed: "+id+". Your item is held in escrow.");
   }catch(Exception e){p.sendMessage("Listing failed: "+e.getMessage());}return true;
  }return false;
 }
}
