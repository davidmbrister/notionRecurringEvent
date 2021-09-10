/* ================================================================================

	Recurring tasks in Notion.so
  
  Glitch example: 
  Find the official Notion API client @ https://github.com/makenotion/notion-sdk-js/

================================================================================ */

const { Client } = require("@notionhq/client")
const dotenv = require("dotenv")
const moment = require('moment')
const OPERATION_BATCH_SIZE = 10
const _ = require("lodash")

dotenv.config()
const notion = new Client({ auth: process.env.NOTION_KEY })

const databaseId = process.env.NOTION_DATABASE_ID

console.log("hello")
/**
 * Local map to store task pageId to props.
 * { [pageId: string]: string or number }
 */
const taskPageIdToPropsMap = {}

/**
 * Initialize local data store.
 * Then poll for changes every 5 seconds (5000 milliseconds).
 */
setInitialTaskPageIdToPropsMap().then(() => {
  setInterval(findNewTasksAndCheckRecurring, 5000)
})

/**
 * Get and set the initial data store with tasks currently in the database.
 */
async function setInitialTaskPageIdToPropsMap() {
  const currentTasks = await getTasksFromNotionDatabase()
  /* for (const { pageId, frequency, originalDate, title } of currentTasks) {
    taskPageIdToPropsMap[pageId] = {title: title, frequency: frequency, originalDate: originalDate}
  } */
}

async function findNewTasksAndCheckRecurring() {
  // Get the tasks currently in the database.
  console.log("\nFetching tasks from Notion DB...")
  const currentTasks = await getTasksFromNotionDatabase()

  // Return any tasks that are not in the local store
  const newTasks = findNewTasks(currentTasks)
  console.log(`Found ${newTasks.length} new tasks.`)
  await addRecurringToMapAndCreateRecurringTasks(newTasks)
}

async function addRecurringToMapAndCreateRecurringTasks(newTasks) {
  newTasks.forEach(newTask => {
    if (taskPageIdToPropsMap[newTask.pageId]) return;
    if (newTask.postFrequency) {
      // add to map and then create new pages according to date and frequency
      const { pageId, title, postFrequency, originalDate } = newTask
      taskPageIdToPropsMap[pageId] = {title: title, frequency: postFrequency, originalDate: originalDate}      
      const task = getPropertiesForNewEventCopy(newTask)
      console.log("no error yet and newTask looks like:" + task["Date"].date.start)
      const date = new Date(task["Date"].date.start+"T10:20:30Z");
      newDate = moment(date).add(7, 'days').toDate();
      console.log(newDate)

      notion.pages.create({
        parent: { database_id: databaseId },
        properties: task,
      })
      // create pages has to take the task and a number, then stagger the new tasks in the calendar using the task.postFrequency
      // createPages(task)
      // update database file (which is just the map object)
    }
    
  })
}

/**
 * Gets tasks from the database.
 *
 * @returns {Promise<Array<{ pageId: string, title: string, postFrequency: number, originalDate: Date }>>}
 */
async function getTasksFromNotionDatabase() {
  const pages = []
  let cursor = undefined

  while (true) {
    const { results, next_cursor } = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
    })
    pages.push(...results)
    if (!next_cursor) {
      break
    }
    cursor = next_cursor
  }
  console.log(`${pages.length} pages successfully fetched.`)
  return pages.map(page => {
    const statusProperty = page.properties["Status"]
    const status = statusProperty ? statusProperty.select.name : "No Status"
    const title = page.properties["Name"].title
      .map(({ plain_text }) => plain_text)
      .join("")
    const postFrequency = page.properties["Frequency"]
    const originalDate = page.properties["Date"]
    console.log(`The original date returned from the Date prop${originalDate}`)
  return {
      pageId: page.id,
      title,
      postFrequency,
      originalDate
    }
  })
}

/**
 * Compares task to most recent version of task stored in taskPageIdToPropsMap.
 * Returns any tasks that have a different status than their last version.
 *
 * @param {Array<{ pageId: string, status: string, title: string }>} currentTasks
 * @returns {Array<{ pageId: string, status: string, title: string }>}
 */
function findNewTasks(currentTasks) {
  return currentTasks.filter(currentTask => {
    if (!taskPageIdToPropsMap[currentTask.pageId])
    return currentTask
  })
}



/**
 * Creates event properties to conform to this database's schema properties.
 *
 * @param {{ number: number, title: string, state: "open" | "closed", comment_count: number, url: string }} issue
 */
function getPropertiesForNewEventCopy(task) {
  const { title, originalDate} = task
  return {
    Name: {
      title: [{ type: "text", text: { content: title } }],
    },  
    "Date": {
      "date": { "start": originalDate.date.start}
    }
  }
}


/**
 * Creates new pages in Notion.
 *
 * https://developers.notion.com/reference/post-page
 *
 * @param {Array<{ number: number, title: string, state: "open" | "closed", comment_count: number, url: string }>} pagesToCreate
 */
async function createPages(pagesToCreate, number = 1) {
  const pagesToCreateChunks = _.chunk(pagesToCreate, OPERATION_BATCH_SIZE)
  for (const pagesToCreateBatch of pagesToCreateChunks) {
    await Promise.all(
      pagesToCreateBatch.map(task =>
        notion.pages.create({
          parent: { database_id: databaseId },
          properties: getPropertiesForNewEventCopy(task),
        })
      )
    )
    console.log(`Completed batch size: ${pagesToCreateBatch.length}`)
  }
}