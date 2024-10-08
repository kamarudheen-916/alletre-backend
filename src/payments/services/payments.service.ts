import { Injectable, MethodNotAllowedException } from '@nestjs/common';
import {
  AuctionStatus,
  AuctionType,
  DurationUnits,
  JoinedAuctionStatus,
  PaymentStatus,
  PaymentType,
  User,
} from '@prisma/client';
import { EmailsType } from 'src/auth/enums/emails-type.enum';
import { StripeService } from 'src/common/services/stripe.service';
import { EmailSerivce } from 'src/emails/email.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prismaService: PrismaService,
    private readonly emailService : EmailSerivce,
  ) {}

  async payDepositBySeller(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
  ) {
    // Create SripeCustomer if has no account
    let stripeCustomerId: string;
    if (!user?.stripeId) {
      stripeCustomerId = await this.stripeService.createCustomer(
        user.email,
        user.userName,
      );

      // Add to user stripeCustomerId
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { stripeId: stripeCustomerId },
      });
    }

    // Check if seller has already pay a depsit for auction
    const userPaymentForAuction = await this.getAuctionPaymentTransaction(
      user.id,
      auctionId,
      PaymentType.SELLER_DEPOSIT,
    );
    if (userPaymentForAuction) {
      // Check startDate for auction
      const auction = await this.prismaService.auction.findFirst({
        where: { id: userPaymentForAuction.auctionId },
      });
      if (
        auction.type === AuctionType.SCHEDULED &&
        auction.startDate < new Date()
      ) {
        throw new MethodNotAllowedException(
          'Auction Start Date Now Not Valid For Publishing.',
        );
      }

      // Retrieve PaymentIntent and clientSecret for clientSide
      const paymentIntent = await this.stripeService.retrievePaymentIntent(
        userPaymentForAuction.paymentIntentId,
      );

      if (paymentIntent.status === 'succeeded')
        throw new MethodNotAllowedException('already paid');

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }

  

     const { clientSecret, paymentIntentId } = 
     await this.stripeService.createDepositPaymentIntent(
       stripeCustomerId,
       amount,
       currency,
     );

    //TODO:  Add currency in payment model
    await this.prismaService.payment.create({
      data: {
        userId: user.id,
        auctionId: auctionId,
        amount: amount,
        paymentIntentId: paymentIntentId,
        type: PaymentType.SELLER_DEPOSIT,
      },
    });
    return { clientSecret, paymentIntentId };
  }

  async payDepositByBidder(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
    bidAmount: number,
  ) {
    
    // Create SripeCustomer if has no account
    let stripeCustomerId: string;
    if (!user?.stripeId) {
      stripeCustomerId = await this.stripeService.createCustomer(
        user.email,
        user.userName,
      );
      
      // Add to user stripeCustomerId
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { stripeId: stripeCustomerId },
      });
    }
    
    // Check if bidder has already pay deposit for auction
    const bidderPaymentForAuction = await this.getAuctionPaymentTransaction(
      user.id,
      auctionId,
      PaymentType.BIDDER_DEPOSIT,
    );
    if (bidderPaymentForAuction) {
      // Retrieve PaymentIntent and clientSecret for clientSide
      const paymentIntent = await this.stripeService.retrievePaymentIntent(
        bidderPaymentForAuction.paymentIntentId,
      );
      console.log('pay deposite by bidder===>',bidderPaymentForAuction);
      
      if (paymentIntent.status === 'succeeded') {
        throw new MethodNotAllowedException('already paid');
       }
      
      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }
    
    
    // Create PaymentIntent
    // const { clientSecret, paymentIntentId } =
    // await this.stripeService.createPaymentIntent(
    //   stripeCustomerId,
    //   amount,
    //     currency,
    //     { bidAmount: Number(bidAmount) },
    //   );

      // Create PaymentIntent 
      // the above is commented out becuase now we are holding (authorizing) the money.
      const { clientSecret, paymentIntentId } =
      await this.stripeService.createDepositPaymentIntent(
        stripeCustomerId,
        amount,
        currency,
        { bidAmount: Number(bidAmount) },
      );

    //TODO:  Add currency in payment model
    await this.prismaService.payment.create({
      data: {
        userId: user.id,
        auctionId: auctionId,
        amount: amount,
        paymentIntentId: paymentIntentId,
        type: PaymentType.BIDDER_DEPOSIT,
      },
    });
    return { clientSecret, paymentIntentId };
  }

  async payAuctionByBidder(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
  ) {
    // Create SripeCustomer if has no account
    let stripeCustomerId: string;
    if (!user?.stripeId) {
      stripeCustomerId = await this.stripeService.createCustomer(
        user.email,
        user.userName,
      );

      // Add to user stripeCustomerId
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { stripeId: stripeCustomerId },
      });
    }

    // Check if bidder has already has transaction for auction
    const bidderPaymentTransaction = await this.getAuctionPaymentTransaction(
      user.id,
      auctionId,
      PaymentType.AUCTION_PURCHASE,
    );
    if (bidderPaymentTransaction) {
      // Retrieve PaymentIntent and clientSecret for clientSide
      const paymentIntent = await this.stripeService.retrievePaymentIntent(
        bidderPaymentTransaction.paymentIntentId,
      );

      if (paymentIntent.status === 'succeeded')
        throw new MethodNotAllowedException('already paid');

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }

    // Create PaymentIntent
    const { clientSecret, paymentIntentId } =
      await this.stripeService.createPaymentIntent(
        stripeCustomerId,
        amount,
        currency,
      );

    //TODO:  Add currency in payment model
    await this.prismaService.payment.create({
      data: {
        userId: user.id,
        auctionId: auctionId,
        amount: amount,
        paymentIntentId: paymentIntentId,
        type: PaymentType.AUCTION_PURCHASE,
      },
    });
    return { clientSecret, paymentIntentId };
  }

  async createBuyNowPaymentTransaction(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
  ) {
    // Create SripeCustomer if has no account
    let stripeCustomerId: string;
    if (!user?.stripeId) {
      stripeCustomerId = await this.stripeService.createCustomer(
        user.email,
        user.userName,
      );

      // Add to user stripeCustomerId
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { stripeId: stripeCustomerId },
      });
    }

    // Check if user has already has transaction for auction
    const userPaymentTransaction = await this.getAuctionPaymentTransaction(
      user.id,
      auctionId,
      PaymentType.BUY_NOW_PURCHASE,
    );
    if (userPaymentTransaction) {
      // Retrieve PaymentIntent and clientSecret for clientSide
      const paymentIntent = await this.stripeService.retrievePaymentIntent(
        userPaymentTransaction.paymentIntentId,
      );

      if (paymentIntent.status === 'succeeded')
        throw new MethodNotAllowedException('already paid');

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }

    // Create PaymentIntent
    const { clientSecret, paymentIntentId } =
      await this.stripeService.createPaymentIntent(
        stripeCustomerId,
        amount,
        currency,
      );

    //TODO:  Add currency in payment model
    await this.prismaService.payment.create({
      data: {
        userId: user.id,
        auctionId: auctionId,
        amount: amount,
        paymentIntentId: paymentIntentId,
        type: PaymentType.BUY_NOW_PURCHASE,
      },
    });
    return { clientSecret, paymentIntentId };
  }

  async webHookEventHandler(payload: Buffer, stripeSignature: string) {
    console.log('Webhook Called ==> payload',payload);
    console.log('Webhook Called ==> stripeSignature',stripeSignature);

    const { paymentIntent, status } = await this.stripeService.webHookHandler(
      payload,
      stripeSignature,
    );
    console.log('PaymentIntent data :===>',paymentIntent,status);

    switch (status) {
      case PaymentStatus.CANCELLED: 
      // const auctionCancelPaymentTransaction =
          await this.prismaService.payment.update({
            where: { paymentIntentId: paymentIntent.id },
            data:{status:PaymentStatus.CANCELLED}
          });
          
      break;  
      case PaymentStatus.HOLD:

        const auctionHoldPaymentTransaction =
          await this.prismaService.payment.findUnique({
            where: { paymentIntentId: paymentIntent.id },
          });

          switch (auctionHoldPaymentTransaction.type) {
            case PaymentType.BIDDER_DEPOSIT:
            console.log('Webhook BIDDER_DEPOSIT ...');

            await this.prismaService.$transaction([
              // Update payment transaction
              this.prismaService.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.HOLD },
              }),

              // Join user to auction
              this.prismaService.joinedAuction.create({
                data: {
                  userId: auctionHoldPaymentTransaction.userId,
                  auctionId: auctionHoldPaymentTransaction.auctionId,
                },
              }),

              // Create bid for user
              this.prismaService.bids.create({
                data: {
                  userId: auctionHoldPaymentTransaction.userId,
                  auctionId: auctionHoldPaymentTransaction.auctionId,
                  amount: paymentIntent.metadata.bidAmount,
                },
              }),
            ]);

            break;
            case PaymentType.SELLER_DEPOSIT:
              console.log('Webhook SELLER_DEPOSIT ...');
  
              // Update Auction
              await this.publishAuction(auctionHoldPaymentTransaction.auctionId);
  
              // Update payment transaction
              await this.prismaService.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.HOLD },
              });
              break;
              default:
                break
          }
        break;

        //==============================================================
      case PaymentStatus.SUCCESS:
        const auctionPaymentTransaction =
          await this.prismaService.payment.findUnique({
            where: { paymentIntentId: paymentIntent.id },
          });
          console.log('auctionPaymentTransaction :' ,auctionPaymentTransaction,paymentIntent )
        switch (auctionPaymentTransaction.type) {
          case PaymentType.BIDDER_DEPOSIT:
            console.log('Webhook BIDDER_DEPOSIT ...');

            await this.prismaService.$transaction([
              // Update payment transaction
              this.prismaService.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.SUCCESS },
              }),

                // // Join user to auction
                // this.prismaService.joinedAuction.create({
                //   data: {
                //     userId: auctionPaymentTransaction.userId,
                //     auctionId: auctionPaymentTransaction.auctionId,
                //   },
                // }),

                // // Create bid for user
                // this.prismaService.bids.create({
                //   data: {
                //     userId: auctionPaymentTransaction.userId,
                //     auctionId: auctionPaymentTransaction.auctionId,
                //     amount: paymentIntent.metadata.bidAmount,
                //   },
                // }),
            ]);

            break;

          case PaymentType.SELLER_DEPOSIT:
            console.log('Webhook SELLER_DEPOSIT ...');

            // Update Auction
            // await this.publishAuction(auctionPaymentTransaction.auctionId);

            // Update payment transaction
            await this.prismaService.payment.update({
              where: { paymentIntentId: paymentIntent.id },
              data: { status: PaymentStatus.SUCCESS },
            });
            break;

          case PaymentType.AUCTION_PURCHASE:
            console.log('Webhook AUCTION_PURCHASE ...');

            const joinedAuction =
              await this.prismaService.joinedAuction.findFirst({
                where: {
                  userId: auctionPaymentTransaction.userId,
                  auctionId: auctionPaymentTransaction.auctionId,
                },
                include:{
                  user:true
                }
              });

       
           const {paymentSuccessData} = await this.prismaService.$transaction(async prisma =>{
                   // Update payment transaction
                 const paymentSuccessData =    await prisma.payment.update({
                    where: { paymentIntentId: paymentIntent.id },
                    data: { status: PaymentStatus.SUCCESS },
                    include:{auction:{include:{
                      product:{include:{images:true}},
                      user:true
                    }}}
                  })
    
                  // Update joinedAuction for bidder to WAITING_DELIVERY
                  await prisma.joinedAuction.update({
                    where: { id: joinedAuction.id },
                    data: {
                      status: JoinedAuctionStatus.WAITING_FOR_DELIVERY,
                    },
                  })
    
                  // Update auction status to sold
                  await prisma.auction.update({
                    where: { id: auctionPaymentTransaction.auctionId },
                    data: { status: AuctionStatus.SOLD },
                  })
                  return {paymentSuccessData}
            })
            if(paymentSuccessData){
              //send email to the seller 
              let emailBodyToSeller = {
                subject :'Payment successful',
                title:'Your auction winner has paid the full amount',
                Product_Name : paymentSuccessData.auction.product.title,
                img:paymentSuccessData.auction.product.images[0].imageLink,
                message:` Hi, ${paymentSuccessData.auction.user.userName}, 
                          The winner of your Auction of ${paymentSuccessData.auction.product.title}
                         (Model:${paymentSuccessData.auction.product.model}) has been paid the full amount. 
                         We would like to let you know that you can hand over the item to the winner. once the winner
                         confirmed the delvery, we will send the money to your wallet. If you refuse to hand over the item, 
                         there is a chance to lose your security deposite.
                         If you would like to participate another auction, Please click the button below. Thank you. `,
                Button_text :'Click here to create another Auction',
                Button_URL :process.env.FRONT_URL
              }
              let emailBodyToWinner = {
                subject :'Payment successful',
                title:'Payment successful',
                Product_Name : paymentSuccessData.auction.product.title,
                img:paymentSuccessData.auction.product.images[0].imageLink,
                message:` Hi, ${joinedAuction.user.userName}, 
                          You have successfully paid the full amount of Auction of ${paymentSuccessData.auction.product.title}
                         (Model:${paymentSuccessData.auction.product.model}). Please confirm the delivery once the delivery is completed 
                         by clicking the confirm delivery button from the page : MY Bids -> waiting for delivery. 
                          We would like to thank you and appreciate you for choosing Alle Tre.  
                          If you would like to participate another auction, Please click the button below. Thank you. `,
                Button_text :'Click here to create another Auction',
                Button_URL :process.env.FRONT_URL
              }
              Promise.all([
                await this.emailService.sendEmail(paymentSuccessData.auction.user.email,'token',EmailsType.OTHER,emailBodyToSeller),
                await this.emailService.sendEmail(joinedAuction.user.email,'token',EmailsType.OTHER,emailBodyToWinner)
              ])
            }
            break;
          case PaymentType.BUY_NOW_PURCHASE:
            console.log('Webhook BUY_NOW_PURCHASE ...');

            await this.prismaService.$transaction([
              // Update payment transaction
              this.prismaService.payment.update({
                where: { paymentIntentId: paymentIntent.id },
                data: { status: PaymentStatus.SUCCESS },
              }),

              // Update auction status to sold
              this.prismaService.auction.update({
                where: { id: auctionPaymentTransaction.auctionId },
                data: { status: AuctionStatus.SOLD },
              }),
            ]);

          default:
            break;
        }

        break;
      case PaymentStatus.FAILED:
        console.log('Payment Intent Failed ..');
        // Update Payment
        await this.prismaService.payment.update({
          where: { paymentIntentId: paymentIntent.id },
          data: { status: PaymentStatus.FAILED },
        });
        break;
      default:
        break;
    }
  }

  async getAuctionPaymentTransaction(
    userId: number,
    auctionId: number,
    type: PaymentType,
  ) {
    return await this.prismaService.payment.findFirst({
      where: {
        userId,
        auctionId,
        type: type,
      },
    });
  }
  async publishAuction(auctionId: number) {

    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
    });
    console.log('publish auction for checking :-->',auction);
    
    switch (auction.durationUnit) {
      case DurationUnits.DAYS:
        if (auction.type === AuctionType.ON_TIME) {
          // Set ON_TIME Daily auction ACTIVE
          const today = new Date();
          const expiryDate = this.addDays(today, auction.durationInDays);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
          });
        } else if (auction.type === AuctionType.SCHEDULED) {
          // Set Schedule Daily auction
          const startDate = auction.startDate;
          const expiryDate = this.addDays(startDate, auction.durationInDays);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.IN_SCHEDULED,
              expiryDate: expiryDate,
            },
          });
        }
        break;

      case DurationUnits.HOURS:
        if (auction.type === AuctionType.ON_TIME) {
          // Set ON_TIME hours auction ACTIVE
          const today = new Date();
          const expiryDate = this.addHours(new Date(), auction.durationInHours);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
          });
        } else if (auction.type === AuctionType.SCHEDULED) {
          // Set Schedule hours auction
          const startDate = auction.startDate;
          const expiryDate = this.addHours(startDate, auction.durationInHours);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.IN_SCHEDULED,
              expiryDate: expiryDate,
            },
          });
        }
    }
  }

  addHours(date: Date, hours: number) {
    const newDate = new Date(date.getTime() + hours * 60 * 60 * 1000);
    // const newDate = new Date(date.getTime() + 10 * 60 * 1000); // Add 10 minutes

    return newDate;
  }

  addDays(date: Date, days: number) {
    const currentDate = date;
    const newDate = new Date(currentDate.setDate(currentDate.getDate() + days));
    return newDate;
  }
}
