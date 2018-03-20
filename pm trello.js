'use strict';

const {google} = require('googleapis');
const Trello = require('trello'); // https://github.com/norberteder/trello
const secrets = require('./secrets.json');
const fs = require('fs');
const util = require('util');

// this holds the tickets coming out of our google spreadsheet
class Ticket 
{

  constructor (theme, boulder, feature, description, swag, pm, pgm, scrumTeam, quadmester, priority)
  {
    this.theme = theme;
    this.boulder = boulder;
    this.feature = feature;
    this.title = feature;
    this.description = description;
    this.swag = swag;
    this.sprintSwag = 0;
    this.pm = pm;
    this.pgm = pgm;
    this.scrumTeam = scrumTeam;
    this.sprint = '';
    if (quadmester)
      this.quadmester = quadmester.toLowerCase();

    this.priority = priority;

    if (Ticket.labels)
      this.label = Ticket.labels[scrumTeam];
    if (!this.label)
    {
      this.label = null;
      console.log(`missing label for ${this.feature} (${this.scrumTeam})`);
    }
  }
}

class ScrumTeam
{
  constructor(name)
  {
    // TODO: hack that this is hard coded and also I assume the same
    //       velocity fo all sprints
    this._velocity = 
      {
        BAM: 6,
        Infrastructure: 6,
        Integrations: 5,
        TBD: 0,
        SRE: 0,
        Partner: 4,
        MIB: 5 ,
        Contributor: 7,
        eComm: 6,
        Organizations: 5,
        Partners: 4,
        SNAP: 8, 
        Content: 5,
      };

    this.name = name;
    this.velocity = this._velocity[name];
  }

}

class ScrumTeams
{
  constructor()
  {
    this.items = new Map();
  }

  *[Symbol.iterator]() 
  {  
    for(const [, value] of this.items)
    {
      yield value;
    }
  }

  add(team)
  {
    this.items.set(team, new ScrumTeam(team));
  }  
}


class Quadmesters
{
  constructor()
  {
    this.items = new Map();
  }

  *[Symbol.iterator]() 
  {  
    for(const [, value] of this.items)
    {
      yield value;
    }
  }

  add(quadmester)
  {
    this.items.set(quadmester, new Quadmester(quadmester));
  }
}

class Quadmester
{
  constructor(name)
  {
    this.name = name;
    this.sprints = [];
    for(let i = 0;i<7;i++)
      this.sprints.push(`${name} s(${i})`);
  }
}

class Tickets 
{
  constructor() 
  {
    this.items = [];
    this.pms = new Set();
    this.quadmesters = new Quadmesters();
    this.scrumTeams = new ScrumTeams(); 
    this.sprints = new Map();
  }

  *[Symbol.iterator]() 
  {  
    for(const ticket of this.items)
    {
      yield ticket;
    }
  }


  addTickets(rows)
  {
    if (rows.length === 0) 
    {
      console.log('No data found.');
      return;
    } 

    for (let i = 0; i < rows.length; i++) 
    {
      const row = rows[i];

      // icky constants, i know...
      // todo: at some point I'd like to use the names of the headers to 
      // map the columns so that if someone adds columns to the spreadsheet
      // I can still find all of my data
      tickets.push(new Ticket(row[0], row[1], row[2], row[3], row[5], row[7], row[8], row[9], row[11], row[15]));
    }
  }

  async saveToFile()
  {

    const writeFile = util.promisify(fs.writeFile);
    
    try 
    {
      await writeFile ('foo.txt', JSON.stringify(this.items), 'utf8');        
      console.log('wrote file');
    } 
    catch (error) 
    {
      console.log(`error closing file ${error}`);
    }
  }

  log()
  {
    for (const ticket of this.tickets)
    {
      console.log(`${ticket.quadmester}:${ticket.sprint}: ${ticket.feature}`);
    }
  }

  push(ticket) 
  {
    if (!ticket)
    {
      console.log('push requires a ticket');
      return;
    }
    // add the ticket to the list of tickets
    this.items.push(ticket);

    // create an associative array for the pms & scrumteams
    if (ticket.pm)
      this.pms.add(ticket.pm);

    if (ticket.scrumTeam)
      this.scrumTeams.add(ticket.scrumTeam);

    // skip the garbage quadmesters
    switch (ticket.quadmester) 
    {
      case 'duplicate':
      case undefined:
      case 'later':
      case 'target period':
        // console.log(`skipping ${val}`);
        // do nothing          
        break;
      default:
        // console.log(`found ${val}`);
        // first add it to a set so I don't get duplicates
        this.quadmesters.add(ticket.quadmester);
        break;
    }

    return ticket;
  }

  getQuadmester(quad)
  {
    // this is just the tickets that are in the current quadmester
    return this.items.filter( 
      (ticket) =>
      {
        return ticket.quadmester === quad;
      }
    );  
  }

  getTeamQuadmester(quadmester, team)
  {
    // this is just the tickets that are in the current quadmester
    return this.items.filter( 
      (ticket) =>
      {
        return ticket.quadmester === quadmester.name && ticket.scrumTeam === team.name;
      }
    );  
  }


}

async function clearListsFromBoard(boardId) // eslint-disable-line
{
  // first get a list of all of my boards
  const lists = await trello.getListsOnBoard(boardId);

  // then close/archive them
  try 
  {
    const promises = [];
    const options = {value:'true'};

    // loop over all of the lists and trigger a close for each one
    for (const list of lists)     
    {
      const url = `/1/lists/${list.id}/closed`;
      // store them all in a promise array so that I can proces them synchonously
      promises.push(await trello.makeRequest('PUT', url, options));    
    }
    // now wait until all of the lists have been closed
    await Promise.all(promises);
  } 
  catch (error) 
  {
    console.log(`error closing lists: ${error}`);      
  }

}

// get the labels (names and colors) from the board and puts them in the  
// Ticket class (so that I can correctly label the tickets as I create them).
//
// it's a little creepy to have this code out here because it's two different 
// systems that shouldn't really have to know about each other (trello and tickets)
// perhaps I should load the labels seperately and pass them into the tickets
// in it's constructor, but that didn't feel quite right either
async function getLabelsFromBoard(boardId)
{
  try 
  {
    // it's just one call and it's quick so let's block
    const labels = await trello.getLabelsForBoard(boardId);  

    // right now I only care about the id of the label because
    // that's what trello uses to set them.
    for (const label of labels) 
    {
      if (!Ticket.labels) 
        Ticket.labels = {};
      Ticket.labels[label.name] = label.id;  
    }
    // console.log(labels);  
  } 
  catch (error) 
  {
    console.log(`error in get Labels from Board: ${error}`);
  }
}

async function addCardsToTrello(theTickets)
{
  if (!theTickets)
  {
    const error = 'tickets is undefined';
    console.log(error);
    throw Error(error);
  }


  // collect all of the responses in a promise array
  // making sure that the id of the promise matches the id
  // if the ticket so that I can track them in case of error
  try 
  {
    // get the list of lists from Trello
    const trelloLists = await trello.getListsOnBoard(secrets.boardId);  

    // cache the lists in a Map
    const lists = new Map();
    for (const list of trelloLists)
    {
      lists.set(list.name, list.id);
    }

    console.log (`filling ${theTickets.length} tickets`);

    const promises = [];
    let listId = '';
    for (const ticketId in theTickets) 
    {
      const ticket = theTickets[ticketId];
    
      // if the list doesn't already exist then I need to create it  it
      listId = lists.get(ticket.sprint);
      if (!listId)
      {
        const trelloList = await trello.addListToBoard(secrets.boardId, ticket.sprint);
        lists.set(ticket.sprint, trelloList.id);
        listId = trelloList.id;
      }

      const extraParams = 
      {
        desc: ticket.description,
        idLabels: ticket.label,
        pos: ticketId,
      };
    
      promises[ticketId] = trello.addCardWithExtraParams(ticket.title, extraParams, listId);                  
    }    

    // now run all of them at once and block until they're all done
    const values = await Promise.all(promises) ;   
    console.log(`added ${values.length} cards to list`);
  } 
  catch (error) 
  {
    console.log(`addCardsToListFromTickets: ${error}`);      
  }
}

function getSheet() 
{
  const sheets = google.sheets('v4');
  const req =  
  {
    auth: secrets.googleKeyId,
    spreadsheetId: secrets.sheetId,
    range: 'Consolidated PL!A2:P500'
  };

  sheets.spreadsheets.values.get(req, processGoogleSheet);
}

// this is the event handler for processing the spreadsheet I get from google
async function processGoogleSheet(err, response)
{
  if (err) 
  {
    console.log(`The google sheets API returned an error: ${err}`);
    throw new Error(err);
  }


  // I have a spreadsheet from Googl (wahoo)
  // now I'm going to build a trello board from it.
  try 
  {
    // warning: scary side effects! 
    // getLablesFromBoard pulls the labels from my board and adds them to 
    // my Ticket class so that later on I can use that to label/color 
    // my tickets the right scrumTeam. This makes me uncomfortable,
    // but I can't think of a better way right now.
    await getLabelsFromBoard(secrets.boardId);

    // this simply makes me an array of tickets from the spreadsheet rows
    tickets.addTickets(response.data.values);

    // save the tickets (from the google spreadsheet to a json file)
    // TODO: turn this back on
    //tickets.saveToFile();

    // start by archiving the lists this is might be a little sketchy
    await clearListsFromBoard(secrets.boardId);

    // loop over the quadmesters and get a list of tickets for each one
    let allTickets = [];
    for (const quadmester of tickets.quadmesters)
    {
      for (const team of tickets.scrumTeams)
      {
        // if there are any tickets for this quadmester then let's add them
        const teamTickets = tickets.getTeamQuadmester(quadmester, team);
        if(teamTickets.length === 0)
        {
          console.log(`${quadmester.name}, team ${team.name} doesn't have any tickets`);
          break; // get the next quadmester/team
        }

        const sprintsTickets = splitQuadTicketsIntoSprintsTickets(teamTickets);
        //const flattenedTickets = flattenTicketGroups(sprintsTickets);

        const allocatedTickets = allocateTicketsToSprints(sprintsTickets);
        allTickets = allTickets.concat(allocatedTickets);
        for (const ticket of allocatedTickets)
        {
          console.log(`${ticket.quadmester}:${ticket.sprint}:${ticket.scrumTeam} ${ticket.feature}`);
        }    
      }
    }
    addCardsToTrello(allTickets);
  }
  catch(error)
  {
    console.log(error);
  }
}

class SprintAllocator
{
  constructor()
  {
    this.velocity = [6,6,6,6,6,6,6];
    this.currentSprint = 0;
  }

  setSprint(ticket)
  {
    if (ticket.currentTicketNumber === ticket.numberOfTickets)
    {
      for (const v in this.velocity) 
      {
        if (this.velocity[v] > 0) 
          this.currentSprint = v;
      }
    }
    // if there's room in the current sprint then I can put the ticket there
    if(this.velocity[this.currentSprint] > 0)
    {
      // put the ticket in the sprint and consume one of the velocity
      ticket.sprint = this.currentSprint;
      this.velocity[this.currentSprint] -= 1;

      // increment the current sprint (wrapping 0-6)
      this.currentSprint = (this.currentSprint + 1) % 7;
    }

    // if I run out of velocity in this sprint then move to the next sprint
    else if (this.velocity[this.currentSprint] === 0)
    {
      for(const s in this.velocity)
      {
        if(this.velocity[s] !== 0)
        {
          ticket.sprint = s;
          this.velocity[this.currentSprint] -= 1;
          this.currentSprint = (this.currentSprint + 1) % 7;
        }
      }
      // if I made it here then all of the sprints are full
      console.log(`can't add ticket ${ticket.feature}. quadmester full!`);
    }
    return ticket;
  }

}

function allocateTicketsToSprints(teamsTickets)
{
  const theTickets = [];
  const allocator = new SprintAllocator();
  for (const ticketGroup of teamsTickets)
  {
    for (const ticket of ticketGroup)
    {
      const tick = allocator.setSprint(ticket);
      if(tick)
        theTickets.push(tick);
      else
        console.log(`sprint allocator returned empty ${ticket}`);

    }
  }
  return(theTickets);
}

// takes a ticket and splits it into 10 sprint units
function splitTicketIntoSprints(ticket)
{
  const ticketSize = ticket.swag;
  let lastSprintSize = 10;
  if (ticketSize % 10 !== 0)
    lastSprintSize = ticketSize % 10;

  // round up for the number of tickets
  const numberOfTickets = Math.ceil(ticketSize / 10);

  const sprintTickets = [];
  for(let index = 0;index < numberOfTickets;index++)
  {
    const sprintTicket = Object.assign({}, ticket);
    sprintTicket.numberOfTickets = numberOfTickets;
    sprintTicket.currentTicketNumber = index+1;
    sprintTicket.title = `${sprintTicket.title} ${sprintTicket.numberOfTickets}/${sprintTicket.currentTicketNumber}`; 

    // the last ticket can be a fraction of 10 points.
    if (index === numberOfTickets - 1)
      sprintTicket.sprintSwag = lastSprintSize;
    else
      sprintTicket.sprintSwag = 10;

    sprintTickets.push(sprintTicket);
  }

  //console.log(sprintTickets);
  return sprintTickets;
}

// takes a quadmester's worth of tickets and breaks them into 
// a tickets for each engineers sprint's worth of work
function splitQuadTicketsIntoSprintsTickets(quadsTickets)
{
  const sprintsTickets = new Tickets();
  for(const ticket of quadsTickets)
  {
    sprintsTickets.push(splitTicketIntoSprints(ticket));
  }
  return sprintsTickets;
}

// takes a list of tickets for a series of sprints and 
// add them to the trello board

// TODO: right now this function is incorrect i'm in the middle of 
// cleaning up the code. This was writteb before I started splitting
// the tickets seperately from creating the trello cards
async function addCardsToSprints(quadmester, quadTickets)
{
  try 
  {    
    console.log(`add cards to sprint ${quadmester}`);

    // create a trello list for each sprint in the quadmester
    // to do this in parallel I collect all of the function calls
    // into an array of promises and then call then all at once with
    // promise.all 

    const promises = [];
    for (const sprint of tickets.sprints[quadmester])
    {
      promises.push(trello.addListToBoard(secrets.boardId, sprint));
    }
    // collect all of the lists from my promises
    const lists = await Promise.all(promises);

    for (const list of lists) 
    {
      if(!list.id)
      {
        console.log('missing id in addCardsToSpring');
      }
      else
      {
        console.log(`add cards to sprint: ${list.name}`);
      }
    }
    const teams = [];
    // collect the tickets grouped by scrumteam
    for (const team in tickets.scrumTeams) 
    {
      // get a list of the tickets for a given team in a quadmester
      const teamsTickets = quadTickets.filter(ticket => {return ticket.scrumTeam === team;});
      //store them in an array
      teams.push(teamsTickets);

      // now I need to loop over them adding them to the sprints
      //const sprintBudget = team.velocity[team];
      for(const ticket in teamsTickets)
      {
        console.log(ticket);
      }
    }
    console.log(teams);  
  } 
  catch (error) 
  {
    console.log(`add cards to team ${error}`);
    throw Error(error);
    
  }
}

const tickets = new Tickets();

// setup trello as me
const trello = new Trello(secrets.trelloKey, secrets.trelloToken);

// the pm board

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/sheets.googleapis.com-nodejs-quickstart.json

// zeke: I don't know if this line does anything...
//var SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];  

// get sheet from google, this also kicks off the rest of the code
// yay asyncness
try 
{
  getSheet();  
} 
catch (error) 
{
  console.log(`can't get google sheet: ${error}`);
}

