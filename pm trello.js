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

    if (Ticket.labels)
    {
      this.label = Ticket.labels[scrumTeam];
      if (!this.label)
      console.log('missing label for ' + this.scrumTeam);
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
//var SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];  

// get sheet from google, this also kicks off the rest of the code
// yay asyncness
getSheet();

async function clearListsFromBoard(boardId)
{
  // first get a list of all of my boards
  let lists = await trello.getListsOnBoard(boardId);

  // then close/archive them
  try 
  {
    let promises = [];

    // loop over all of the lists and trigger a close for each one
    for (const list of lists)     
    {
      let url = '/1/lists/' + list.id + '/closed';
      let options = { value:'true'};

      // store them all in a promise array so that I can proces them synchonously
      promises.push(await trello.makeRequest("PUT", url, options));    
    }
    // now wait until all of the lists have been closed
    let values = await Promise.all(promises);
  } 
  catch (error) 
  {
    console.log("error closing lists: " + error);      
  }

}

async function getLabelsFromBoard(boardId)
{
  try 
  {
    const labels = await trello.getLabelsForBoard(boardId);  
    for (const label of labels) 
    {
      if (!Ticket.labels) Ticket.labels = {};
      Ticket.labels[label.name] = label.id;  
    }
    // console.log(labels);  
  } 
  catch (error) 
  {
    console.log('error in get Labels from Board: ' + error);
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
    idLabels: ticket.label,
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

    // trello boards contains lists of cards. this pulls all of the lists
    // from my current c
    // a trelloList has id, idBoard, name, pos etc

    // start by clearling the lists
    // this might be a little sketchy
    clearListsFromBoard(secrets.boardId);

    // loop over the quadmesters and get a list of tickets for each one
    for (let quad in tickets.quadmesters)
    {
      // if there are any tickets for this quadmester then let's add them
      let quadsTickets = tickets.getQuad(tickets.quadmesters[quad]);
      if (quadsTickets.length > 0)
      {
        console.log('creating trelloList:' + tickets.quadmesters[quad]);
        let trelloList = await trello.addListToBoard(secrets.boardId, tickets.quadmesters[quad])
        addCardsToListFromQuadmester(trelloList.id, quadsTickets);
      }
    }
  }
  catch(error)
  {
    console.log(error);
  }
}