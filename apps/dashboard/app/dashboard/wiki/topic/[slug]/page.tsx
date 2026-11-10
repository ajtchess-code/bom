import {redirect} from "next/navigation";
const topics:Record<string,string>={ships:"ShipsToPlay","cannons-and-weapons":"Cannons",crafting:"Crafting_Recipes","trade-goods":"Resources","ports-and-port-battles":"WorldPorts",crew:"Crew_Special",upgrades:"ShipUpgradesNew",guilds:"GuildBonuses"};
export default async function WikiTopicPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;redirect(`/dashboard/wiki?table=${topics[slug]||"Gamepedia"}`);}
