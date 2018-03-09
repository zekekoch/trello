'use strict';

var {google} = require('googleapis');
var Trello = require('trello'); // https://github.com/norberteder/trello
var secrets = require('./secrets.json');

// this holds the tickets coming out of our google spreadsheet
class Ticket 
{
  constructor (theme, boulder, feature, description, swag, pm, pgm, scrumTeam, quadmester, priority)
  {
    this.theme = theme;
    this.boulder = boulder;
    this.feature = feature;
    this.description = description;
    this.swag = swag;
    this.pm = pm;
    this.pgm = pgm;
    this.scrumTeam = scrumTeam;
    if (quadmester)
      this.quadmester = quadmester.toLowerCase();

    this.priority = priority;

    switch(scrumTeam)
    {
      case "Contributor":
        this.color = "5a947e8835b91abfde48f9bc";
        break;
      case "MIB":
        this.color = "5a947e8835b91abfde48f9be";
        break;
      case "Partner":
        this.color = "5a947e8835b91abfde48f9bf";
        break;
      case "eComm":
        this.color = "5a947e8835b91abfde48f9bd";
        break;
      case "Infra":
        this.color = "5a947e8835b91abfde48f9bb";
        break;
      default:
        this.color = null;
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
    this.scrumTeams = {};  
  }

  addTickets(rows)
  {
    if (rows.length == 0) 
    {
      console.log('No data found.');
      return;
    } 
    // skip the header row
    for (let i = 0; i < rows.length; i++) 
    {
      let row = rows[i];

      // icky constants, i know...
      let ticket = tickets.add(new Ticket(row[0], row[1], row[2], row[3], row[5], row[7], row[8], row[9], row[11], row[15]));
    }
  }

  add(ticket) 
  {
    // poor man's static variable, there must be a better idiom in js
    if (this.length == undefined)
      this.length = 0;
    else
      this.length++;

    // add the ticket to the list of tickets
    this.items[this.length] = ticket;

    // create an associative array for the pms & scrumteams
    this.pms[ticket.pm] = ticket.pm;
    this.scrumTeams[ticket.scrumTeam] = ticket.scrumTeam;

    // skip the garbage quadmesters
    let quadmester = ticket.quadmester;
    switch (quadmester) {
      case 'duplicate':
      case undefined:
      case 'later':
      case 'target period':
        // console.log('skipping ' + val);
        // do nothing          
        break;
      default:
        // console.log('found ' + val);
        // create the quadmesters
        this.quadmesters[quadmester] = quadmester;
        
        // add 7 sprints per quadmester
        for(let sprint = 1;sprint <= 7;sprint++)
        {
          this.quadmesters[quadmester + "-" + sprint] = quadmester + " s" + sprint;
        }          
        break;
    }

    return ticket;
  }

  getQuad(quad)
  {
    // this is just the tickets that are in the current quadmester
    return this.items.filter(
      function(ticket) 
      {
        return ticket.quadmester == quad;
      }
    );  
  }
}

var tickets = new Tickets();

// setup trello as me
var trello = new Trello(secrets.trelloKey, secrets.trelloToken);

// the pm board

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/sheets.googleapis.com-nodejs-quickstart.json
// zeke: I don't know if this line does anything...
var SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];  

// get sheet from google, this also kicks off the rest of the code
// yay asyncness
getSheet();

async function clearListsFromBoard(trelloLists)
{

  for (const listKey in trelloLists) 
  {
    let url = '/1/lists/' + trelloLists[listKey].id + '/closed';
    let options = { value:'true'};

    try 
    {
      await trello.makeRequest("PUT", url, options);    
    } 
    catch (error) 
    {
      console.log("error closing lists: " + error);      
    }
  }
}

async function addCardsToListFromQuadmester(listId, tickets)
{
  let promises = [];

  if (tickets)
  {
    // collect all of the responses in a promise array
    // making sure that the id of the promise matches the id
    // if the ticket so that I can track them in case of error
    try 
    {
      console.log ("filling " + tickets.length + " tickets");
      for (const ticketId in tickets) 
      {
        promises[ticketId] = addCardToListFromTicket(listId, tickets[ticketId], ticketId);                  
      }    

      // now run all of them at once
      let values = await Promise.all(promises) ;   
      console.log("added " + values.length + "cards to list")
    } 
    catch (error) 
    {
      console.log('addCardsToListFromQuadmester: ' + error);      
    }
  }
  else
  {
    console.log('tickets is undefined');
  }
}

function addCardToListFromTicket(listId, ticket, position)
{
  let title = ticket.feature + " (" + ticket.swag + ")";
  //console.log('adding ticket to ' + listId + ':' + title);

  let extraParams = {
    desc: ticket.description,
    //TODO put in the correct labels
    idLabels: ticket.color,
    pos: position
  };

  // take info on a card and returns a promise
  return trello.addCardWithExtraParams(title, extraParams, listId)
}

function getSheet() 
{
  let rows = {};
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
    console.log('The google sheets API returned an error: ' + err);
    throw new Error(err);
  }

  tickets.addTickets(response.data.values);

  // i now have my tickets so I need to create the trello board
  // i'm assuming that the previous stuff works somewhat synchronously, but I'm bluffing
  // never a great thing when you're programming, but it seems to be working for now...

  // i'm new to promises, so i'm sure this syntax is ugly
  // why oh why is js so weird...

  // first I want to create a list per quadmester
  try 
  {
    let trelloLists = await trello.getListsOnBoard(secrets.boardId);
    // a trelloList has id, idBoard, name, pos etc

    // start by clearling the lists
    clearListsFromBoard(trelloLists);

    // loop over the quadmesters and get a list of tickets for each one
    for (let quad in tickets.quadmesters)
    {
      // console.log("processing " + tickets.quadmesters[quad]);

      // if there are any tickets for this quadmester then let's add them
      let quadsTickets = tickets.getQuad(tickets.quadmesters[quad]);
      if (quadsTickets.length > 0)
      {
                // look for a trelloList for the current quadmester  
        let trelloList = trelloLists.find
        (
          (list) =>
          {
            // i lowercased the quadmesters since the pdgms are sloppy
            if (list.closed == true)
              return false;
            else if (list.name.toLowerCase() == tickets.quadmesters[quad]) 
              return true;
            else
              return false;
          }
        );

        if (!trelloList) //i need to create a new list
        {
          console.log('creating trelloList:' + tickets.quadmesters[quad]);
          trelloList = await trello.addListToBoard(secrets.boardId, tickets.quadmesters[quad])
        }
        else
        {
          console.log('found trelloList:' + tickets.quadmesters[quad]);
        }

        addCardsToListFromQuadmester(trelloList.id, quadsTickets);
      }
    }
  }
  catch(error)
  {
    console.log(error);
  }
}