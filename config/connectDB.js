import mongoose from 'mongoose'
import 'dotenv/config';

export default async function connectDB(){
  try{
    await mongoose.connect(process.env.MONGO_URI);
  }catch(err){
    console.log(err)
  }
}
