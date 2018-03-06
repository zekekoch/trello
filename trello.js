var Trello = require("trello") // https://github.com/norberteder/trello
var trello = new Trello("cc24ec0031db052dc1d9d080fa5516ed", "bf58b4b32ed8c4c3a65b88195a941e6c0ef7c93e0705015e1572ab1073281e00");
var boardId = "jFwFCR16";
var morganBoardId = "f0USlOt1"

var zekeBoard;
trello.getListsOnBoard(boardId, handleZekeBoard);

var morganBoard;
trello.getListsOnBoard(morganBoardId, handleMorganBoard);

if (zekeBoard) {
    console.log("zeke's board");
    Board.forEach(list => {
        console.log(list.name);
    });
}

if (morganBoard) {
    console.log("morgan's board");
    Board.forEach(list => {
        console.log(list.name);
    });
}

function handleZekeBoard(error, board)
{
    if (error) 
    {
        console.log("couldn't get zeke's board");
    }
    else 
    {
        zekeBoard = board;   
        console.log("found board" + board);
        board.forEach(list => {
            console.log(list);
            trello.getCardsOnList(list.id, handleCardsOnList); 
        }); 
 
    }
}

function handleMorganBoard(error, board)
{
    if (error) 
    {
        console.log("couldn't get zeke's board");
    }
    else 
    {
        morganBoard = board;    
        console.log("found board" + board);
//        board.forEach(list => {
//            console.log(list);
//            trello.getCardsOnList(list.id, handleCardsOnList); 
        }); 
    }    
}

// gets the list of boards
function handleListsOnBoard (error, board) 
{
    if (error) 
    {
        console.log("couldn't get lists on board");
    }
    else 
    {
        var Board = board;
        console.log("found board" + board);
        board.forEach(list => {
            console.log(list);
            trello.getCardsOnList(list.id, handleCardsOnList); 
        }); 
    }
}

function handleCardsOnList(error, list) 
{
    if (error) console.log("couldn't get cards on list");
    else 
    {
        list.forEach(card => {
        //      trello.deleteCard(card.id, handleDeleteCard);
        })
    }
}

function handleDeleteCard(error) 
{
    if (error) console.log("couldn't delete card")
    else
    { 
        console.log("delete card");
    }
}

  /*
trello.addCard('Clean car', 'Wax on, wax off', myListId,
    function (error, trelloCard) {
        if (error) {
            console.log('Could not add card:', error);
        }
        else {
            console.log('Added card:', trelloCard);
        }
    });

    */