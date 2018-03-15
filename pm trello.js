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
    if (quadmester)
      this.quadmester = quadmester.toLowerCase();

    this.priority = priority;

    if (Ticket.labels)
    {
      this.label = Ticket.labels[scrumTeam];
      if (!this.label)
      {
        console.log(`missing label for ${this.scrumTeam}`);
      }
    }
    else
    {  
      throw Error('you must add Ticket.labels before creating your first ticket');
    }
  }
}

class Tickets 
{
  constructor() 
  {
    this.items = [];
    this.pms = {};
    this.quadmesters = {};
    this.sprints = {};
    this.scrumTeams = {}; 
    this.velocity = 
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
  }

  addTickets(rows)
  {
    if (rows.length === 0) 
    {
      console.log('No data found.');
      return;
    } 
    // skip the header row
    for (let i = 0; i < rows.length; i++) 
    {
      const row = rows[i];

      // icky constants, i know...
      tickets.add(new Ticket(row[0], row[1], row[2], row[3], row[5], row[7], row[8], row[9], row[11], row[15]));
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

  add(ticket) 
  {
    // poor man's static variable, there must be a better idiom in js
    if (this.length === undefined)
      this.length = 0;
    else
      this.length++;

    // add the ticket to the list of tickets
    this.items[this.length] = ticket;

    // create an associative array for the pms & scrumteams
    this.pms[ticket.pm] = ticket.pm;
    this.scrumTeams[ticket.scrumTeam] = ticket.scrumTeam;

    // skip the garbage quadmesters
    const quadmester = ticket.quadmester;
    switch (quadmester) 
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
        // create the quadmesters
        this.quadmesters[quadmester] = quadmester;
        if (!this.sprints[quadmester])
        {
          this.sprints[quadmester] = [];        
          // add 7 sprints per quadmester
          for(let sprint = 0;sprint < 7;sprint++)
          {
            this.sprints[quadmester][sprint] = `${quadmester} (s${sprint})`;
          }          
        }
        break;
    }

    return ticket;
  }

  getQuad(quad)
  {
    // this is just the tickets that are in the current quadmester
    return this.items.filter( 
      (ticket) =>
      {
        return ticket.quadmester === quad;
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

async function addCardsToListFromTickets(listId, tickets)
{
  if (!tickets)
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
    console.log (`filling ${tickets.length} tickets`);

    const promises = [];
    for (const ticketId in tickets) 
    {
      promises[ticketId] = addCardToListFromTicket(listId, tickets[ticketId], ticketId);                  
    }    

    // now run all of them at once and block until they're all done
    const values = await Promise.all(promises) ;   
    console.log(`added ${values.length} cards to list`);
  } 
  catch (error) 
  {
    console.log(`addCardsToListFromQuadmester: ${error}`);      
  }
}

function addCardToListFromTicket(listId, ticket, position)
{
  const title = `${ticket.feature}: (${ticket.swag})`;

  const extraParams = 
  {
    desc: ticket.description,
    idLabels: ticket.label,
    pos: position,
  };

  // take info on a card and returns a promise
  return trello.addCardWithExtraParams(title, extraParams, listId);
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

    // this simply makes me an array of tickets
    tickets.addTickets(response.data.values);

    // save the tickets (from the google spreadsheet to a json file)
    tickets.saveToFile();

    // start by archiving the lists this is might be a little sketchy
    clearListsFromBoard(secrets.boardId);

    // loop over the quadmesters and get a list of tickets for each one
    for (const quad in tickets.quadmesters)
    {
      // if there are any tickets for this quadmester then let's add them
      const quadmester = tickets.quadmesters[quad];
      const quadsTickets = tickets.getQuad(quadmester);
      if (quadsTickets.length > 0)
      {
        addCardsToQuadmester(quadmester, quadsTickets);
        
        const sprintsTickets = splitQuadTicketsIntoSprintsTickets(quadsTickets);
        addCardsToSprints(quadmester, sprintsTickets);
      }
      else
      {
        console.log(`there aren't any tickets for ${quad}`);
      }
    }
  }
  catch(error)
  {
    console.log(error);
  }
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
    sprintTicket.title = `${sprintTicket.title} ${index+1}/${numberOfTickets}`; 

    // the last ticket can be a fraction of 10 points.
    if (index === numberOfTickets - 1)
      sprintTicket.sprintSwag = lastSprintSize;
    else
      sprintTicket.sprintSwag = 10;

    sprintTickets.push(sprintTicket);
  }

  console.log(sprintTickets);
  return sprintTickets;
}

// takes a quadmester's worth of tickets and breaks them into 
// a tickets for each engineers sprint's worth of work
function splitQuadTicketsIntoSprintsTickets(tickets)
{
  const sprintsTickets = [];
  for(const ticket of tickets)
  {
    sprintsTickets.push(splitTicketIntoSprints(ticket));
  }
  console.log(sprintsTickets);
  return sprintsTickets;
}

// takes and array of arrays of tickets that are already split into
// single engineer sprint chunks
function disperseTicketsIntoSprints(tickets)
{}


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

    splitTicketIntoSprints(quadTickets);

    for (const list of lists) 
    {
      if(!list.id)
        console.log('missing id in addCardsToSpring');
      else
        console.log(`add cards to sprint: ${list.name}`);
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
      const sprintBudget = tickets.velocity[team];
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

async function addCardsToQuadmester(quadmester, quadTickets)
{
  try 
  {
    console.log(`creating trelloList: ${quadmester}`);

    // first create a list for the whole quadmester
    // and create cards for each ticket and add them to that list
    const trelloList = await trello.addListToBoard(secrets.boardId, quadmester);
    await addCardsToListFromTickets(trelloList.id, quadTickets);   
    await addCardsToSprints(quadmester, quadTickets);
  } 
  catch (error) 
  {
    console.log(`error adding cards to sprint ${error}`);
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

